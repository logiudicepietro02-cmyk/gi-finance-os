export const NOT_AVAILABLE = "Dato non disponibile";

/** Normalized financial statement fields (camelCase, EUR units). */
export const STATEMENT_FIELDS = [
  "revenue",
  "ebitda",
  "ebit",
  "netIncome",
  "cash",
  "financialDebt",
  "netFinancialPosition",
  "equity",
  "currentAssets",
  "currentLiabilities",
  "inventory",
  "totalAssets",
  "interestExpense",
  "principalRepayment",
  "depreciation",
] as const;

export type StatementField = (typeof STATEMENT_FIELDS)[number];
export type StatementValues = { [K in StatementField]?: number | null };

export const FIELD_LABELS: Record<StatementField, string> = {
  revenue: "Ricavi",
  ebitda: "EBITDA",
  ebit: "EBIT",
  netIncome: "Utile netto",
  cash: "Disponibilità liquide",
  financialDebt: "Debiti finanziari",
  netFinancialPosition: "PFN",
  equity: "Patrimonio netto",
  currentAssets: "Attivo corrente",
  currentLiabilities: "Passivo corrente",
  inventory: "Rimanenze",
  totalAssets: "Totale attivo",
  interestExpense: "Oneri finanziari",
  principalRepayment: "Quota capitale annua",
  depreciation: "Ammortamenti",
};

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Converts numbers, numeric strings and Prisma Decimals to number; anything else → null. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Picks the statement fields out of any record (e.g. a Prisma FinancialStatement). */
export function statementToValues(record: Partial<Record<StatementField, unknown>>): StatementValues {
  const values: StatementValues = {};
  for (const field of STATEMENT_FIELDS) {
    values[field] = toNumber(record[field]);
  }
  return values;
}
