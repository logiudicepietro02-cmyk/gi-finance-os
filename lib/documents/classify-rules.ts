/** Deterministic keyword classifier: always available, also used as a cross-check for the AI. */
import type { DocumentTypeKey } from "./types";

const KEYWORDS: Record<Exclude<DocumentTypeKey, "ALTRO">, [string, number][]> = {
  BILANCIO: [
    ["stato patrimoniale", 3],
    ["conto economico", 3],
    ["nota integrativa", 2],
    ["totale patrimonio netto", 2],
    ["valore della produzione", 2],
    ["differenza tra valore e costi della produzione", 2],
    ["bilancio d'esercizio", 3],
    ["bilancio al 31", 2],
    ["totale attivo", 1],
  ],
  VISURA: [
    ["visura", 3],
    ["registro delle imprese", 3],
    ["camera di commercio", 2],
    ["numero rea", 2],
    ["codice ateco", 2],
    ["capitale sociale", 1],
    ["sede legale", 1],
    ["forma giuridica", 1],
  ],
  DOCUMENTO_BANCARIO: [
    ["centrale rischi", 3],
    ["estratto conto", 3],
    ["accordato", 2],
    ["utilizzato", 1],
    ["saldo contabile", 2],
    ["fido", 1],
    ["iban", 1],
    ["segnalazione", 1],
  ],
  FINANZIAMENTO: [
    ["contratto di finanziamento", 3],
    ["piano di ammortamento", 3],
    ["tasso annuo nominale", 2],
    ["taeg", 2],
    ["mutuo", 2],
    ["erogazione", 1],
    ["rata", 1],
    ["fondo di garanzia", 2],
  ],
  BUSINESS_PLAN: [
    ["business plan", 4],
    ["piano industriale", 3],
    ["piano economico-finanziario", 3],
    ["proiezioni", 2],
    ["ipotesi", 1],
    ["budget", 1],
    ["strategia", 1],
  ],
  SITUAZIONE_CONTABILE: [
    ["situazione contabile", 4],
    ["bilancio di verifica", 3],
    ["situazione economica", 2],
    ["situazione patrimoniale", 2],
    ["infrannuale", 2],
  ],
  DOCUMENTO_IDENTITA: [
    ["carta d'identità", 4],
    ["carta di identità", 4],
    ["passaporto", 3],
    ["documento di riconoscimento", 3],
    ["luogo di nascita", 1],
  ],
};

export interface RulesClassification {
  type: DocumentTypeKey;
  confidence: number;
  fiscalYear: number | null;
  matchedKeywords: string[];
  scores: Partial<Record<DocumentTypeKey, number>>;
}

export function normalizeText(text: string): string {
  return text
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectFiscalYear(text: string): number | null {
  const lower = normalizeText(text).toLowerCase();
  const patterns = [
    /(?:bilancio|esercizio|situazione)[^.]{0,40}?al 31[/.\-]12[/.\-](\d{4})/,
    /31[/.\-]12[/.\-](\d{4})/,
    /esercizio (\d{4})/,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m) {
      const year = Number(m[1]);
      if (year >= 1990 && year <= 2100) return year;
    }
  }
  return null;
}

/** Italian VAT number / tax code (11 digits) next to its label. */
export function extractTaxId(text: string): string | null {
  const m = normalizeText(text).match(/(?:partita iva|p\.\s?iva|codice fiscale|c\.\s?f\.)[\s:n.°]*(?:IT)?\s?(\d{11})\b/i);
  return m ? m[1] : null;
}

export function classifyByRules(text: string): RulesClassification {
  const lower = normalizeText(text).toLowerCase();
  const scores: Partial<Record<DocumentTypeKey, number>> = {};
  const matched: Record<string, string[]> = {};

  for (const [type, keywords] of Object.entries(KEYWORDS) as [DocumentTypeKey, [string, number][]][]) {
    let score = 0;
    for (const [kw, weight] of keywords) {
      if (lower.includes(kw)) {
        score += weight;
        (matched[type] ??= []).push(kw);
      }
    }
    if (score > 0) scores[type] = score;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [DocumentTypeKey, number][];
  const [top, second] = ranked;
  if (!top || top[1] < 3) {
    return { type: "ALTRO", confidence: 0.3, fiscalYear: detectFiscalYear(text), matchedKeywords: [], scores };
  }
  const margin = second ? (top[1] - second[1]) / top[1] : 1;
  const confidence = Math.min(0.95, 0.45 + Math.min(top[1], 10) * 0.04 + margin * 0.1);
  return {
    type: top[0],
    confidence: Math.round(confidence * 100) / 100,
    fiscalYear: detectFiscalYear(text),
    matchedKeywords: matched[top[0]] ?? [],
    scores,
  };
}
