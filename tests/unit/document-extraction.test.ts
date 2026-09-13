import { describe, expect, it } from "vitest";
import { extractBilancioByRules, parseItalianNumber } from "@/lib/documents/bilancio-rules";
import { classifyByRules, detectFiscalYear } from "@/lib/documents/classify-rules";
import {
  BILANCIO_FIELD_KEYS,
  bilancioExtractionSchema,
  emptyBilancioExtraction,
} from "@/lib/documents/extraction-schema";
import { validateBilancioExtraction } from "@/lib/documents/validation";

const PAGE_1 = `ALFA MECCANICA S.R.L.
Sede in Via dell'Industria 10 - Brescia · Partita IVA 99912345678
Bilancio d'esercizio al 31/12/2025 · Valori espressi in euro
STATO PATRIMONIALE                     2025        2024
ATTIVO
C) Attivo circolante
I - Rimanenze
Totale rimanenze                   1.200.000   1.050.000
II - Crediti
1) verso clienti esigibili entro l'esercizio successivo 2.900.000 2.500.000
IV - Disponibilità liquide
1) depositi bancari e postali        790.000     940.000
Totale disponibilità liquide         800.000     950.000
Totale attivo circolante           5.000.000   4.600.000
Totale attivo                     12.500.000  11.900.000
PASSIVO
A) Patrimonio netto
I - Capitale                         100.000     100.000
Totale patrimonio netto            3.000.000   2.400.000
D) Debiti
4) debiti verso banche             4.300.000   3.900.000
5) debiti verso altri finanziatori   500.000     450.000
Totale debiti esigibili entro l'esercizio successivo 4.000.000 3.700.000`;

const PAGE_2 = `CONTO ECONOMICO                         2025        2024
A) Valore della produzione
1) Ricavi delle vendite e delle prestazioni 10.000.000 9.200.000
Totale valore della produzione    10.150.000   9.300.000
B) Costi della produzione
10) Ammortamenti e svalutazioni
a) ammortamento delle immobilizzazioni immateriali 50.000 45.000
Totale ammortamenti e svalutazioni   500.000     480.000
Differenza tra valore e costi della produzione (A - B) 1.000.000 900.000
C) Proventi e oneri finanziari
17) interessi e altri oneri finanziari (200.000) (180.000)
21) Utile (perdita) dell'esercizio   600.000     450.000
Nota integrativa: quota capitale dei finanziamenti rimborsata nell'esercizio 800.000`;

describe("parseItalianNumber", () => {
  it.each([
    ["1.234.567", 1234567],
    ["1.234,56", 1234.56],
    ["(180.000)", -180000],
    ["-50.000", -50000],
    ["0", 0],
    ["12,5", 12.5],
    ["800.000;", 800000],
  ])("%s → %d", (input, expected) => {
    expect(parseItalianNumber(input)).toBe(expected);
  });

  it.each(["1)", "abc", "(12", "1.23.4", ""])("rejects %s", (input) => {
    expect(parseItalianNumber(input)).toBeNull();
  });
});

describe("classification (rules)", () => {
  it("recognises a bilancio with fiscal year", () => {
    const c = classifyByRules(`${PAGE_1}\n${PAGE_2}`);
    expect(c.type).toBe("BILANCIO");
    expect(c.confidence).toBeGreaterThan(0.7);
    expect(c.fiscalYear).toBe(2025);
  });

  it("recognises a visura", () => {
    const c = classifyByRules("VISURA ORDINARIA SOCIETA' DI CAPITALE Registro delle Imprese Camera di Commercio Numero REA BS-123456 Codice ATECO 25.62");
    expect(c.type).toBe("VISURA");
  });

  it("falls back to ALTRO on unrelated text", () => {
    expect(classifyByRules("Lista della spesa: pane, latte").type).toBe("ALTRO");
  });

  it("detects fiscal year formats", () => {
    expect(detectFiscalYear("Bilancio al 31.12.2024")).toBe(2024);
    expect(detectFiscalYear("nessuna data")).toBeNull();
  });
});

describe("bilancio rules extractor", () => {
  const result = extractBilancioByRules([PAGE_1, PAGE_2]);
  const value = (k: keyof typeof result.fields) => result.fields[k].value;

  it("produces a schema-valid extraction", () => {
    expect(bilancioExtractionSchema.safeParse(result).success).toBe(true);
  });

  it("extracts the required fields for the current year column", () => {
    expect(value("revenue")).toBe(10_000_000);
    expect(value("ebit")).toBe(1_000_000);
    expect(value("depreciation")).toBe(500_000);
    expect(value("ebitda")).toBe(1_500_000);
    expect(value("net_income")).toBe(600_000);
    expect(value("cash")).toBe(800_000);
    expect(value("financial_debt")).toBe(4_800_000);
    expect(value("equity")).toBe(3_000_000);
    expect(value("current_assets")).toBe(5_000_000);
    expect(value("current_liabilities")).toBe(4_000_000);
    expect(value("inventory")).toBe(1_200_000);
    expect(value("total_assets")).toBe(12_500_000);
    expect(value("interest_expense")).toBe(-200_000);
    expect(value("principal_repayment")).toBe(800_000);
  });

  it("keeps a reference to the source (page + excerpt)", () => {
    expect(result.fields.revenue.page).toBe(2);
    expect(result.fields.revenue.sourceText).toContain("Ricavi delle vendite");
    expect(result.fields.equity.page).toBe(1);
    expect(result.fields.ebitda.sourceText).toContain("Derivato");
  });

  it("does not invent values that are not in the document", () => {
    expect(value("net_financial_position")).toBeNull();
    expect(result.fields.net_financial_position.sourceText).toBeNull();
  });

  it("reads metadata", () => {
    expect(result.fiscal_year).toBe(2025);
    expect(result.period_end).toBe("2025-12-31");
    expect(result.tax_id).toBe("99912345678");
    expect(result.company_name).toBe("ALFA MECCANICA S.R.L.");
  });

  it("scales values expressed in thousands", () => {
    const r = extractBilancioByRules(["Valori espressi in migliaia di euro. Totale patrimonio netto 3.000 2.400"]);
    expect(r.fields.equity.value).toBe(3_000_000);
  });

  it("returns an empty extraction for unrelated text", () => {
    const r = extractBilancioByRules(["Documento senza numeri di bilancio"]);
    expect(BILANCIO_FIELD_KEYS.every((k) => r.fields[k].value === null)).toBe(true);
  });
});

describe("extraction validation", () => {
  it("accepts a valid extraction", () => {
    const r = validateBilancioExtraction(extractBilancioByRules([PAGE_1, PAGE_2]));
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects wrong types and missing keys (schema)", () => {
    const bad = emptyBilancioExtraction() as unknown as Record<string, unknown>;
    (bad.fields as Record<string, unknown>).revenue = { value: "10 milioni", page: 1, sourceText: null, confidence: 1 };
    const r = validateBilancioExtraction(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("fields.revenue.value");

    const missingKey = emptyBilancioExtraction() as unknown as Record<string, unknown>;
    delete (missingKey.fields as Record<string, unknown>).ebitda;
    expect(validateBilancioExtraction(missingKey).valid).toBe(false);
  });

  it("rejects unknown extra keys (strict schema)", () => {
    const extra = { ...emptyBilancioExtraction(), hallucinated: 1 };
    expect(validateBilancioExtraction(extra).valid).toBe(false);
  });

  it("errors when nothing was extracted", () => {
    const r = validateBilancioExtraction(emptyBilancioExtraction());
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/Nessun dato chiave/);
  });

  it("warns on accounting inconsistencies", () => {
    const e = extractBilancioByRules([PAGE_1, PAGE_2]);
    e.fields.ebit.value = 2_000_000; // EBIT > EBITDA
    e.fields.net_financial_position = { value: 1_000_000, page: 1, sourceText: "PFN 1.000.000", confidence: 0.9 };
    const r = validateBilancioExtraction(e);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes("EBIT maggiore"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("PFN riportata"))).toBe(true);
  });
});
