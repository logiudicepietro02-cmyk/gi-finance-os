/**
 * Generates realistic, clearly fictitious PDF documents (Italian CEE financial statements,
 * company registry extracts, bank reports...) for demo data and automated tests.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface DemoFinancials {
  revenue: number;
  ebit: number;
  depreciation: number;
  netIncome: number;
  cash: number;
  financialDebt: number;
  equity: number;
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
  totalAssets: number;
  interestExpense: number;
  principalRepayment: number;
}

const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.1, 0.11, 0.14);
const MUTED = rgb(0.42, 0.44, 0.5);

/** Italian amount with thousands separator always applied (1.234.567 / -490.000). */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const abs = Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return value < 0 ? `-${abs}` : abs;
}

class Writer {
  page: PDFPage;
  y = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly footer: string,
  ) {
    this.page = this.newPage();
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - 56;
    this.page.drawText(this.footer, { x: 50, y: 28, size: 7.5, font: this.font, color: MUTED });
    return this.page;
  }

  private ensure(height: number) {
    if (this.y - height < 60) this.newPage();
  }

  text(value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) {
    const size = opts.size ?? 10;
    this.ensure(size + 6);
    this.page.drawText(value, { x: opts.x ?? 50, y: this.y, size, font: opts.bold ? this.bold : this.font, color: opts.color ?? INK });
    this.y -= size + 6;
  }

  paragraph(value: string, size = 9.5) {
    const words = value.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(candidate, size) > 495) {
        this.text(line, { size });
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) this.text(line, { size });
  }

  row(label: string, current: number | null, previous?: number | null, opts: { bold?: boolean } = {}) {
    const size = 9.5;
    this.ensure(15);
    const font = opts.bold ? this.bold : this.font;
    this.page.drawText(label, { x: 50, y: this.y, size, font, color: INK });
    if (current !== null) {
      const c = `  ${formatAmount(current)}`;
      this.page.drawText(c, { x: 440 - font.widthOfTextAtSize(c, size), y: this.y, size, font, color: INK });
    }
    if (previous !== undefined && previous !== null) {
      const p = `  ${formatAmount(previous)}`;
      this.page.drawText(p, { x: 545 - font.widthOfTextAtSize(p, size), y: this.y, size, font, color: MUTED });
    }
    this.y -= 15;
  }

  header(current: string, previous?: string) {
    const size = 8.5;
    this.page.drawText(current, { x: 440 - this.bold.widthOfTextAtSize(current, size), y: this.y, size, font: this.bold, color: MUTED });
    if (previous) this.page.drawText(previous, { x: 545 - this.bold.widthOfTextAtSize(previous, size), y: this.y, size, font: this.bold, color: MUTED });
    this.y -= 14;
  }

  gap(height = 8) {
    this.y -= height;
  }
}

async function createWriter(footer: string) {
  const doc = await PDFDocument.create();
  doc.setProducer("GI FINANCE OS — documento dimostrativo");
  doc.setCreator("GI FINANCE OS");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, writer: new Writer(doc, font, bold, footer) };
}

interface CompanyIdentity {
  companyName: string;
  vatNumber: string;
  city: string;
  province?: string;
}

const DEMO_FOOTER = "Documento dimostrativo con dati fittizi generato da GI FINANCE OS";

export async function generateBilancioPdf(input: CompanyIdentity & { fiscalYear: number; current: DemoFinancials; previous?: DemoFinancials | null }) {
  const { doc, writer: w } = await createWriter(DEMO_FOOTER);
  const cur = input.current;
  const prev = input.previous ?? null;
  const y = input.fiscalYear;
  const headerCur = `31/12/${y}`;
  const headerPrev = prev ? `31/12/${y - 1}` : undefined;
  const pick = <T>(fn: (f: DemoFinancials) => T) => (prev ? fn(prev) : undefined);

  const derived = (f: DemoFinancials) => {
    const fixedAssets = f.totalAssets - f.currentAssets;
    const receivables = f.currentAssets - f.inventory - f.cash;
    const severance = Math.round(f.totalAssets * 0.03);
    const totalDebts = f.totalAssets - f.equity - severance;
    const bankDebt = Math.round(f.financialDebt * 0.85);
    const otherLenders = f.financialDebt - bankDebt;
    const suppliers = Math.max(0, totalDebts - f.financialDebt);
    const otherRevenue = Math.round(f.revenue * 0.012);
    const production = f.revenue + otherRevenue;
    const costs = production - f.ebit;
    const materials = Math.round(costs * 0.45);
    const services = Math.round(costs * 0.2);
    const personnel = costs - materials - services - f.depreciation;
    const preTax = f.ebit - f.interestExpense;
    const taxes = preTax - f.netIncome;
    return { fixedAssets, receivables, severance, totalDebts, bankDebt, otherLenders, suppliers, otherRevenue, production, costs, materials, services, personnel, preTax, taxes };
  };
  const dc = derived(cur);
  const dp = prev ? derived(prev) : null;

  w.text(input.companyName.toUpperCase(), { size: 15, bold: true });
  w.text(`Sede in ${input.city}${input.province ? ` (${input.province})` : ""} - Partita IVA ${input.vatNumber} - Codice fiscale ${input.vatNumber}`, { size: 9, color: MUTED });
  w.gap(6);
  w.text(`Bilancio d'esercizio al 31/12/${y}`, { size: 12, bold: true });
  w.text("Bilancio redatto secondo lo schema previsto dagli artt. 2424 e 2425 del Codice Civile - Valori espressi in euro", { size: 8.5, color: MUTED });
  w.gap(10);

  w.text("STATO PATRIMONIALE", { size: 11, bold: true });
  w.header(headerCur, headerPrev);
  w.text("ATTIVO", { size: 9.5, bold: true });
  w.row("B) Immobilizzazioni", null);
  w.row("Totale immobilizzazioni", dc.fixedAssets, dp?.fixedAssets, { bold: true });
  w.row("C) Attivo circolante", null);
  w.row("I - Rimanenze", null);
  w.row("Totale rimanenze", cur.inventory, pick((f) => f.inventory));
  w.row("II - Crediti", null);
  w.row("Totale crediti", dc.receivables, dp?.receivables);
  w.row("IV - Disponibilità liquide", null);
  w.row("1) depositi bancari e postali", cur.cash - 2_000, pick((f) => f.cash - 2_000));
  w.row("3) danaro e valori in cassa", 2_000, prev ? 2_000 : undefined);
  w.row("Totale disponibilità liquide", cur.cash, pick((f) => f.cash));
  w.row("Totale attivo circolante", cur.currentAssets, pick((f) => f.currentAssets), { bold: true });
  w.row("Totale attivo", cur.totalAssets, pick((f) => f.totalAssets), { bold: true });
  w.gap(6);
  w.text("PASSIVO", { size: 9.5, bold: true });
  w.row("A) Patrimonio netto", null);
  w.row("I - Capitale", 100_000, prev ? 100_000 : undefined);
  w.row("IX - Utile (perdita) dell'esercizio", cur.netIncome, pick((f) => f.netIncome));
  w.row("Totale patrimonio netto", cur.equity, pick((f) => f.equity), { bold: true });
  w.row("C) Trattamento di fine rapporto di lavoro subordinato", dc.severance, dp?.severance);
  w.row("D) Debiti", null);
  w.row("4) debiti verso banche", dc.bankDebt, dp?.bankDebt);
  w.row("5) debiti verso altri finanziatori", dc.otherLenders, dp?.otherLenders);
  w.row("7) debiti verso fornitori", dc.suppliers, dp?.suppliers);
  w.row("Totale debiti esigibili entro l'esercizio successivo", cur.currentLiabilities, pick((f) => f.currentLiabilities));
  w.row("Totale debiti", dc.totalDebts, dp?.totalDebts, { bold: true });
  w.row("Totale passivo", cur.totalAssets, pick((f) => f.totalAssets), { bold: true });

  w.newPage();
  w.text("CONTO ECONOMICO", { size: 11, bold: true });
  w.header(headerCur, headerPrev);
  w.row("A) Valore della produzione", null);
  w.row("1) Ricavi delle vendite e delle prestazioni", cur.revenue, pick((f) => f.revenue));
  w.row("5) altri ricavi e proventi", dc.otherRevenue, dp?.otherRevenue);
  w.row("Totale valore della produzione", dc.production, dp?.production, { bold: true });
  w.row("B) Costi della produzione", null);
  w.row("6) per materie prime, sussidiarie, di consumo e di merci", dc.materials, dp?.materials);
  w.row("7) per servizi", dc.services, dp?.services);
  w.row("9) per il personale", dc.personnel, dp?.personnel);
  w.row("10) ammortamenti e svalutazioni", null);
  w.row("Totale ammortamenti e svalutazioni", cur.depreciation, pick((f) => f.depreciation));
  w.row("Totale costi della produzione", dc.costs, dp?.costs, { bold: true });
  w.row("Differenza tra valore e costi della produzione (A - B)", cur.ebit, pick((f) => f.ebit), { bold: true });
  w.row("C) Proventi e oneri finanziari", null);
  w.row("17) interessi e altri oneri finanziari", cur.interestExpense, pick((f) => f.interestExpense));
  w.row("Risultato prima delle imposte (A - B + - C + - D)", dc.preTax, dp?.preTax);
  w.row("20) Imposte sul reddito dell'esercizio", dc.taxes, dp?.taxes);
  w.row("21) Utile (perdita) dell'esercizio", cur.netIncome, pick((f) => f.netIncome), { bold: true });

  w.gap(14);
  w.text("NOTA INTEGRATIVA (estratto)", { size: 11, bold: true });
  w.paragraph(
    "Debiti verso banche: comprendono mutui chirografari e linee di credito a breve termine. Nel corso dell'esercizio la società ha regolarmente rimborsato le rate dei finanziamenti in essere.",
  );
  w.row("Quota capitale dei finanziamenti rimborsata nell'esercizio", cur.principalRepayment, pick((f) => f.principalRepayment));
  w.gap(6);
  w.paragraph(`Il presente bilancio rappresenta in modo veritiero e corretto la situazione patrimoniale e finanziaria della società al 31/12/${y}.`);

  return doc.save();
}

async function generateTextPdf(title: string, subtitle: string, sections: { heading?: string; lines: string[] }[]) {
  const { doc, writer: w } = await createWriter(DEMO_FOOTER);
  w.text(title, { size: 14, bold: true });
  w.text(subtitle, { size: 9, color: MUTED });
  w.gap(10);
  for (const section of sections) {
    if (section.heading) w.text(section.heading, { size: 10.5, bold: true });
    for (const line of section.lines) w.paragraph(line);
    w.gap(8);
  }
  return doc.save();
}

export function generateVisuraPdf(input: CompanyIdentity & { reaNumber: string; ateco: string; sector: string; foundedYear: number; legalRepresentative: string }) {
  return generateTextPdf("VISURA ORDINARIA SOCIETA' DI CAPITALE", `Registro delle Imprese - Camera di Commercio di ${input.city} - Documento dimostrativo`, [
    {
      heading: "Informazioni generali",
      lines: [
        `Denominazione: ${input.companyName.toUpperCase()}`,
        "Forma giuridica: societa' a responsabilita' limitata",
        `Sede legale: ${input.city}${input.province ? ` (${input.province})` : ""}`,
        `Numero REA: ${input.reaNumber}`,
        `Codice fiscale e numero di iscrizione: ${input.vatNumber} - Partita IVA ${input.vatNumber}`,
        `Data di costituzione: ${input.foundedYear}`,
      ],
    },
    { heading: "Attività", lines: [`Codice ATECO: ${input.ateco} - ${input.sector}`, "Stato attività: attiva"] },
    { heading: "Capitale e amministrazione", lines: ["Capitale sociale: sottoscritto 100.000 euro, versato 100.000 euro", `Amministratore unico: ${input.legalRepresentative} (nominativo fittizio)`] },
  ]);
}

export function generateCentraleRischiPdf(input: CompanyIdentity & { referenceDate: string; lines: { bank: string; category: string; granted: number; used: number }[] }) {
  return generateTextPdf("CENTRALE RISCHI - Banca d'Italia", `Prospetto delle segnalazioni riferite a ${input.companyName} (P. IVA ${input.vatNumber}) - data contabile ${input.referenceDate}`, [
    {
      heading: "Segnalazioni per intermediario",
      lines: input.lines.map((l) => `${l.bank} - ${l.category}: accordato ${formatAmount(l.granted)} euro, utilizzato ${formatAmount(l.used)} euro`),
    },
    { heading: "Sconfinamenti", lines: ["Nessuno sconfinamento segnalato nel periodo.", "Prospetto dimostrativo con intermediari fittizi."] },
  ]);
}

export function generateBusinessPlanPdf(input: CompanyIdentity & { fromYear: number; revenues: number[]; ebitda: number[]; investments: number }) {
  return generateTextPdf(`BUSINESS PLAN ${input.fromYear}-${input.fromYear + input.revenues.length - 1}`, `${input.companyName} - Piano economico-finanziario`, [
    {
      heading: "Strategia e ipotesi di sviluppo",
      lines: [
        "Il piano industriale prevede l'espansione commerciale sui mercati esteri e l'investimento in ricerca e sviluppo di nuove soluzioni.",
        `Investimenti previsti nel periodo: ${formatAmount(input.investments)} euro, finanziati in parte con finanza agevolata.`,
      ],
    },
    {
      heading: "Proiezioni",
      lines: input.revenues.map((r, i) => `Esercizio ${input.fromYear + i}: ricavi ${formatAmount(r)} euro, EBITDA ${formatAmount(input.ebitda[i])} euro`),
    },
  ]);
}

export function generateLoanContractPdf(input: CompanyIdentity & { bank: string; amount: number; rate: number; months: number; startDate: string; maturityDate: string }) {
  return generateTextPdf("CONTRATTO DI FINANZIAMENTO CHIROGRAFARIO", `${input.bank} - Finanziato: ${input.companyName} (P. IVA ${input.vatNumber})`, [
    {
      heading: "Condizioni economiche",
      lines: [
        `Importo erogato: ${formatAmount(input.amount)} euro - Data erogazione: ${input.startDate}`,
        `Tasso annuo nominale (TAN): ${input.rate.toFixed(2).replace(".", ",")}% fisso - TAEG ${(input.rate + 0.18).toFixed(2).replace(".", ",")}%`,
        `Durata: ${input.months} mesi - Scadenza ultima rata: ${input.maturityDate}`,
        "Piano di ammortamento alla francese con rata mensile posticipata.",
      ],
    },
    { heading: "Garanzie", lines: ["Nessuna garanzia reale. Contratto dimostrativo con dati fittizi."] },
  ]);
}

export function generateSituazioneContabilePdf(input: CompanyIdentity & { date: string; revenue: number; ebit: number; cash: number; bankDebt: number }) {
  return generateTextPdf(`SITUAZIONE CONTABILE AL ${input.date}`, `${input.companyName} - Situazione patrimoniale ed economica infrannuale (bilancio di verifica)`, [
    {
      heading: "Situazione economica",
      lines: [`Ricavi delle vendite e delle prestazioni ${formatAmount(input.revenue)}`, `Differenza tra valore e costi della produzione (A - B) ${formatAmount(input.ebit)}`],
    },
    {
      heading: "Situazione patrimoniale",
      lines: [`Totale disponibilità liquide ${formatAmount(input.cash)}`, `Debiti verso banche ${formatAmount(input.bankDebt)}`],
    },
  ]);
}
