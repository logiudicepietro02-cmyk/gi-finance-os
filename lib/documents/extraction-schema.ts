import { z } from "zod";
import type { StatementField } from "@/lib/financial/fields";

export const BILANCIO_SCHEMA_VERSION = "bilancio.v1";

export const BILANCIO_FIELD_KEYS = [
  "revenue",
  "ebitda",
  "ebit",
  "net_income",
  "cash",
  "financial_debt",
  "net_financial_position",
  "equity",
  "current_assets",
  "current_liabilities",
  "inventory",
  "total_assets",
  "interest_expense",
  "principal_repayment",
  "depreciation",
  // Components used to derive financial_debt deterministically when no total is reported
  "bank_debt",
  "other_lenders_debt",
  "bonds",
] as const;

export type BilancioFieldKey = (typeof BILANCIO_FIELD_KEYS)[number];

/** Minimum set the extraction must attempt (spec §10). */
export const REQUIRED_BILANCIO_FIELDS: BilancioFieldKey[] = [
  "revenue",
  "ebitda",
  "ebit",
  "net_income",
  "cash",
  "financial_debt",
  "net_financial_position",
  "equity",
  "current_assets",
  "current_liabilities",
];

export const BILANCIO_FIELD_LABELS: Record<BilancioFieldKey, string> = {
  revenue: "Ricavi",
  ebitda: "EBITDA",
  ebit: "EBIT",
  net_income: "Utile netto",
  cash: "Disponibilità liquide",
  financial_debt: "Debiti finanziari",
  net_financial_position: "PFN",
  equity: "Patrimonio netto",
  current_assets: "Attivo corrente",
  current_liabilities: "Passivo corrente",
  inventory: "Rimanenze",
  total_assets: "Totale attivo",
  interest_expense: "Oneri finanziari",
  principal_repayment: "Quota capitale annua",
  depreciation: "Ammortamenti",
  bank_debt: "Debiti verso banche",
  other_lenders_debt: "Debiti verso altri finanziatori",
  bonds: "Obbligazioni",
};

export const EXTRACTION_TO_STATEMENT: Partial<Record<BilancioFieldKey, StatementField>> = {
  revenue: "revenue",
  ebitda: "ebitda",
  ebit: "ebit",
  net_income: "netIncome",
  cash: "cash",
  financial_debt: "financialDebt",
  net_financial_position: "netFinancialPosition",
  equity: "equity",
  current_assets: "currentAssets",
  current_liabilities: "currentLiabilities",
  inventory: "inventory",
  total_assets: "totalAssets",
  interest_expense: "interestExpense",
  principal_repayment: "principalRepayment",
  depreciation: "depreciation",
};

export const extractedFieldSchema = z.strictObject({
  /** Amount as a plain number in EUR units (after scaling) */
  value: z.number().nullable(),
  /** 1-based page where the value was found */
  page: z.number().int().min(1).nullable(),
  /** Verbatim excerpt supporting the value */
  sourceText: z.string().max(500).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export type ExtractedField = z.infer<typeof extractedFieldSchema>;

const fieldsShape = Object.fromEntries(BILANCIO_FIELD_KEYS.map((k) => [k, extractedFieldSchema])) as Record<
  BilancioFieldKey,
  typeof extractedFieldSchema
>;

export const bilancioExtractionSchema = z.strictObject({
  fiscal_year: z.number().int().min(1990).max(2100).nullable(),
  /** ISO date YYYY-MM-DD */
  period_end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  currency: z.string().min(3).max(3),
  /** Unit of the amounts as printed in the document; stored values are always converted to units */
  source_unit: z.enum(["units", "thousands"]),
  company_name: z.string().max(200).nullable(),
  tax_id: z.string().max(20).nullable(),
  fields: z.strictObject(fieldsShape),
  notes: z.array(z.string().max(500)).max(20),
});

export type BilancioExtraction = z.infer<typeof bilancioExtractionSchema>;

export function emptyField(): ExtractedField {
  return { value: null, page: null, sourceText: null, confidence: null };
}

export function emptyBilancioExtraction(): BilancioExtraction {
  return {
    fiscal_year: null,
    period_end: null,
    currency: "EUR",
    source_unit: "units",
    company_name: null,
    tax_id: null,
    fields: Object.fromEntries(BILANCIO_FIELD_KEYS.map((k) => [k, emptyField()])) as BilancioExtraction["fields"],
    notes: [],
  };
}

export function countExtractedFields(e: BilancioExtraction): number {
  return Object.values(e.fields).filter((f) => f.value !== null).length;
}
