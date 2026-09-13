/**
 * Deterministic derivations applied to every extraction (AI or rules).
 * Arithmetic is never delegated to the LLM; derived values are marked "Derivato".
 */
import { BILANCIO_FIELD_KEYS, BILANCIO_FIELD_LABELS, type BilancioExtraction, type ExtractedField } from "./extraction-schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

function derivedConfidence(fields: ExtractedField[]): number {
  const known = fields.map((f) => f.confidence).filter((c): c is number => c !== null);
  return known.length ? Math.round(Math.min(...known) * 95) / 100 : 0.7;
}

export function scaleExtraction(input: BilancioExtraction, factor: number): BilancioExtraction {
  if (factor === 1) return input;
  const e = structuredClone(input);
  for (const key of BILANCIO_FIELD_KEYS) {
    const field = e.fields[key];
    if (field.value !== null) field.value = round2(field.value * factor);
  }
  return e;
}

/** Converts values expressed in thousands to units (the stored unit is always EUR units). */
export function normalizeUnits(input: BilancioExtraction): BilancioExtraction {
  if (input.source_unit !== "thousands") return input;
  const e = scaleExtraction(input, 1000);
  e.notes = [...e.notes, "Importi del documento espressi in migliaia di euro: convertiti in unità dal sistema."].slice(0, 20);
  return e;
}

export function deriveBilancioFields(input: BilancioExtraction): BilancioExtraction {
  const e = structuredClone(input);
  const f = e.fields;
  const notes = [...e.notes];

  if (f.financial_debt.value === null) {
    const parts = (["bank_debt", "other_lenders_debt", "bonds"] as const).filter((k) => f[k].value !== null);
    if (parts.length > 0) {
      const labels = parts.map((k) => BILANCIO_FIELD_LABELS[k]);
      f.financial_debt = {
        value: round2(parts.reduce((sum, k) => sum + (f[k].value as number), 0)),
        page: f[parts[0]].page,
        sourceText: `Derivato: ${labels.join(" + ")}`,
        confidence: derivedConfidence(parts.map((k) => f[k])),
      };
      notes.push(`Debiti finanziari calcolati dal sistema come somma di: ${labels.join(", ")}.`);
    }
  }

  if (f.ebitda.value === null && f.ebit.value !== null && f.depreciation.value !== null) {
    f.ebitda = {
      value: round2(f.ebit.value + f.depreciation.value),
      page: f.ebit.page,
      sourceText: "Derivato: EBIT + Ammortamenti e svalutazioni",
      confidence: derivedConfidence([f.ebit, f.depreciation]),
    };
    notes.push("EBITDA calcolato dal sistema come EBIT + ammortamenti e svalutazioni.");
  }

  e.notes = notes.map((n) => n.slice(0, 500)).slice(0, 20);
  return e;
}
