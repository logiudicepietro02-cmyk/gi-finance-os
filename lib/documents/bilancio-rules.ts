/**
 * Rule-based extractor for Italian financial statements (schema CEE, art. 2424/2425 c.c.).
 * Deterministic and explainable: every value keeps page + source excerpt.
 * Used when no AI provider is configured and as a cross-check for AI extraction.
 */
import { detectFiscalYear, extractTaxId, normalizeText } from "./classify-rules";
import { deriveBilancioFields, scaleExtraction } from "./derive";
import {
  emptyBilancioExtraction,
  type BilancioExtraction,
  type BilancioFieldKey,
  type ExtractedField,
} from "./extraction-schema";

/** Parses Italian-formatted amounts: "1.234.567", "1.234,56", "(12.000)", "-500". */
export function parseItalianNumber(token: string): number | null {
  const cleaned = token.replace(/[€\s;:]/g, "");
  const m = cleaned.match(/^(\()?(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(\))?$/);
  if (!m) return null;
  const [, open, minus, intPart, dec, close] = m;
  if (Boolean(open) !== Boolean(close)) return null;
  const n = Number(`${intPart.replace(/\./g, "")}${dec ? `.${dec}` : ""}`);
  if (!Number.isFinite(n)) return null;
  return open || minus ? -n : n;
}

const ALLOWED_WORDS = new Set(["euro", "eur"]);

/** First amount right after a label; gives up if other words sit in between (e.g. section headings). */
function amountAfter(text: string, from: number): { value: number; end: number } | null {
  const window = text.slice(from, from + 90);
  const tokens = window.split(" ");
  let offset = 0;
  for (const rawToken of tokens) {
    const token = rawToken.trim();
    const start = offset;
    offset += rawToken.length + 1;
    if (!token) continue;
    if (/^(19|20)\d{2}$/.test(token)) continue; // year column headers
    const value = parseItalianNumber(token);
    if (value !== null) return { value, end: from + start + rawToken.length };
    const letters = token.toLowerCase().replace(/[^a-zà-ù]/g, "");
    if (letters.length >= 3 && !ALLOWED_WORDS.has(letters)) return null;
  }
  return null;
}

interface Match {
  value: number;
  page: number;
  sourceText: string;
  primary: boolean;
}

function findAmount(pages: string[], patterns: RegExp[]): Match | null {
  for (let p = 0; p < patterns.length; p++) {
    const re = new RegExp(patterns[p].source, "gi");
    for (let i = 0; i < pages.length; i++) {
      const text = pages[i];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const amount = amountAfter(text, m.index + m[0].length);
        if (amount) {
          return {
            value: amount.value,
            page: i + 1,
            sourceText: text.slice(m.index, amount.end).trim().slice(0, 300),
            primary: p === 0,
          };
        }
        if (m[0].length === 0) re.lastIndex++;
      }
    }
  }
  return null;
}

const PATTERNS: Partial<Record<BilancioFieldKey, RegExp[]>> = {
  revenue: [/ricavi delle vendite e delle prestazioni/, /totale ricavi/, /ricavi netti/],
  ebit: [/differenza tra valore e costi della produzione(?:\s*\(\s*a\s*-\s*b\s*\))?/, /risultato operativo/],
  depreciation: [/totale ammortamenti e svalutazioni/, /ammortamenti e svalutazioni/],
  ebitda: [/\bebitda\b/, /margine operativo lordo/],
  net_income: [/utile \(perdita\) dell'esercizio/, /utile \(perdita\) d'esercizio/, /risultato dell'esercizio/, /utile netto/],
  cash: [/totale disponibilit[aà] liquide/, /disponibilit[aà] liquide/],
  financial_debt: [/totale debiti finanziari/, /indebitamento finanziario lordo/],
  bank_debt: [/debiti verso banche/],
  other_lenders_debt: [/debiti verso altri finanziatori/],
  bonds: [/totale obbligazioni/, /obbligazioni/],
  net_financial_position: [/posizione finanziaria netta/],
  equity: [/totale patrimonio netto/, /patrimonio netto/],
  current_assets: [/totale attivo circolante/, /attivo circolante/],
  current_liabilities: [/totale debiti esigibili entro l'esercizio successivo/, /passivit[aà] correnti/, /passivo corrente/],
  inventory: [/totale rimanenze/],
  total_assets: [/totale attivo(?!\s*circolante)/],
  interest_expense: [/interessi e altri oneri finanziari/, /oneri finanziari/],
  principal_repayment: [
    /quota capitale[a-zà-ù' ]{0,50}?(?:rimborsat[ao]|in scadenza|annua)(?: nell'esercizio| entro l'esercizio successivo)?/,
  ],
};

function toField(match: Match | null): ExtractedField {
  if (!match) return { value: null, page: null, sourceText: null, confidence: null };
  return { value: match.value, page: match.page, sourceText: match.sourceText, confidence: match.primary ? 0.9 : 0.75 };
}

export function extractBilancioByRules(pageTexts: string[]): BilancioExtraction {
  const pages = pageTexts.map(normalizeText);
  const fullLower = pages.join(" ").toLowerCase();
  let result = emptyBilancioExtraction();

  for (const [key, patterns] of Object.entries(PATTERNS) as [BilancioFieldKey, RegExp[]][]) {
    result.fields[key] = toField(findAmount(pages, patterns));
  }

  const thousands = /(valori|importi)\s+(espressi\s+)?in\s+migliaia/.test(fullLower);
  if (thousands) {
    result = scaleExtraction(result, 1000);
    result.source_unit = "thousands";
    result.notes.push("Importi del documento espressi in migliaia di euro: convertiti in unità dal sistema.");
  }

  result = deriveBilancioFields(result);

  result.fiscal_year = detectFiscalYear(pageTexts.join(" "));
  result.period_end = result.fiscal_year ? `${result.fiscal_year}-12-31` : null;

  const original = pages.join(" ");
  const nameMatch = original.match(
    /([A-Z0-9][A-Za-z0-9&'.\- ]{1,80}?\s(?:S\.?\s?R\.?\s?L\.?|S\.?\s?P\.?\s?A\.?|S\.?\s?A\.?\s?S\.?|S\.?\s?N\.?\s?C\.?))(?=\s|$)/,
  );
  result.company_name = nameMatch ? nameMatch[1].trim().slice(0, 200) : null;
  result.tax_id = extractTaxId(original);
  return result;
}
