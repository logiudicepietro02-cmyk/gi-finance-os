export const DOCUMENT_TYPES = [
  "BILANCIO",
  "VISURA",
  "DOCUMENTO_BANCARIO",
  "FINANZIAMENTO",
  "BUSINESS_PLAN",
  "SITUAZIONE_CONTABILE",
  "DOCUMENTO_IDENTITA",
  "ALTRO",
] as const;

export type DocumentTypeKey = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeKey, string> = {
  BILANCIO: "Bilancio",
  VISURA: "Visura camerale",
  DOCUMENTO_BANCARIO: "Documento bancario",
  FINANZIAMENTO: "Finanziamento",
  BUSINESS_PLAN: "Business plan",
  SITUAZIONE_CONTABILE: "Situazione contabile",
  DOCUMENTO_IDENTITA: "Documento d'identità",
  ALTRO: "Altro",
};

/** Document types whose content maps to the financial statement schema. */
export const FINANCIAL_STATEMENT_TYPES: DocumentTypeKey[] = ["BILANCIO", "SITUAZIONE_CONTABILE"];

export function isDocumentType(value: unknown): value is DocumentTypeKey {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}
