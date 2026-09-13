import { bilancioExtractionSchema, type BilancioExtraction } from "./extraction-schema";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Schema validation + accounting consistency checks. Errors block saving; warnings require review. */
export function validateBilancioExtraction(raw: unknown): ValidationResult & { data: BilancioExtraction | null } {
  const parsed = bilancioExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`),
      warnings: [],
      data: null,
    };
  }

  const data = parsed.data;
  const f = data.fields;
  const v = (k: keyof typeof f) => f[k].value;
  const errors: string[] = [];
  const warnings: string[] = [];

  const keyValues = [v("revenue"), v("ebit"), v("equity"), v("total_assets"), v("net_income")];
  if (keyValues.every((x) => x === null)) {
    errors.push("Nessun dato chiave estratto (ricavi, EBIT, patrimonio netto, totale attivo, utile).");
  }
  if (data.fiscal_year === null) warnings.push("Esercizio di riferimento non individuato.");

  const revenue = v("revenue");
  if (revenue !== null && revenue < 0) errors.push("Ricavi negativi: valore non plausibile.");

  const ebit = v("ebit");
  const ebitda = v("ebitda");
  if (ebit !== null && ebitda !== null && ebit > ebitda + 1) {
    warnings.push("EBIT maggiore dell'EBITDA: verificare ammortamenti ed EBITDA.");
  }

  const debt = v("financial_debt");
  const cash = v("cash");
  const nfp = v("net_financial_position");
  if (debt !== null && cash !== null && nfp !== null) {
    const computed = debt - cash;
    const tolerance = Math.max(1000, Math.abs(computed) * 0.02);
    if (Math.abs(computed - nfp) > tolerance) {
      warnings.push("La PFN riportata non coincide con debiti finanziari − disponibilità liquide.");
    }
  }

  const currentAssets = v("current_assets");
  if (cash !== null && currentAssets !== null && cash > currentAssets + 1) {
    warnings.push("Disponibilità liquide superiori all'attivo corrente.");
  }
  const inventory = v("inventory");
  if (inventory !== null && currentAssets !== null && inventory > currentAssets + 1) {
    warnings.push("Rimanenze superiori all'attivo corrente.");
  }
  const totalAssets = v("total_assets");
  if (currentAssets !== null && totalAssets !== null && currentAssets > totalAssets + 1) {
    warnings.push("Attivo corrente superiore al totale attivo.");
  }
  const equity = v("equity");
  if (equity !== null && totalAssets !== null && equity > totalAssets + 1) {
    warnings.push("Patrimonio netto superiore al totale attivo.");
  }
  const netIncome = v("net_income");
  if (netIncome !== null && revenue !== null && revenue > 0 && Math.abs(netIncome) > revenue) {
    warnings.push("Utile/perdita superiore ai ricavi in valore assoluto: verificare.");
  }
  if (equity !== null && equity < 0) warnings.push("Patrimonio netto negativo.");

  for (const [key, field] of Object.entries(f)) {
    if (field.value !== null && field.confidence !== null && field.confidence < 0.6) {
      warnings.push(`Confidenza bassa sul campo ${key}.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, data };
}
