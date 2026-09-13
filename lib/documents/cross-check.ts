import { formatCurrency } from "@/lib/financial/format";
import { BILANCIO_FIELD_KEYS, BILANCIO_FIELD_LABELS, type BilancioExtraction } from "./extraction-schema";

/**
 * Compares the primary (AI) extraction with the deterministic rules extraction.
 * - fills fields the AI missed when rules found them with high confidence (never derived values)
 * - reports discrepancies > 2% for human review
 */
export function crossCheckExtractions(
  primary: BilancioExtraction,
  reference: BilancioExtraction,
): { data: BilancioExtraction; notes: string[] } {
  const data = structuredClone(primary);
  const notes: string[] = [];

  for (const key of BILANCIO_FIELD_KEYS) {
    const a = data.fields[key];
    const b = reference.fields[key];
    const label = BILANCIO_FIELD_LABELS[key];
    const derived = b.sourceText?.startsWith("Derivato") ?? false;

    if (a.value === null && b.value !== null && !derived && (b.confidence ?? 0) >= 0.85) {
      data.fields[key] = { ...b };
      notes.push(`${label}: non estratto dall'AI, recuperato dall'estrattore a regole (pag. ${b.page ?? "?"}).`);
      continue;
    }
    if (a.value !== null && b.value !== null) {
      const tolerance = Math.max(1, Math.abs(b.value) * 0.02);
      if (Math.abs(a.value - b.value) > tolerance) {
        notes.push(`${label}: AI ${formatCurrency(a.value)} vs regole ${formatCurrency(b.value)} — verificare.`);
      }
    }
  }
  return { data, notes };
}
