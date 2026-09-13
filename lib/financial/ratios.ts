/**
 * Deterministic financial ratio engine.
 * Never invents values: missing inputs → status MISSING ("Dato non disponibile"),
 * mathematically meaningless results → status NOT_MEANINGFUL with an explanation.
 */
import {
  FIELD_LABELS,
  NOT_AVAILABLE,
  isFiniteNumber,
  type StatementField,
  type StatementValues,
} from "./fields";

export const RATIO_KEYS = [
  "ebitda_margin",
  "ebit_margin",
  "net_debt",
  "net_debt_to_ebitda",
  "debt_to_ebitda",
  "current_ratio",
  "quick_ratio",
  "interest_coverage",
  "dscr",
  "net_debt_to_equity",
] as const;

export type RatioKey = (typeof RATIO_KEYS)[number];
export type RatioUnit = "percent" | "currency" | "multiple";
export type RatioStatus = "OK" | "MISSING" | "NOT_MEANINGFUL";

export interface RatioInput {
  field: StatementField;
  label: string;
  value: number | null;
}

export interface RatioResult {
  key: RatioKey;
  label: string;
  description: string;
  unit: RatioUnit;
  formula: string;
  higherIsBetter: boolean;
  /** percent ratios are fractions (0.125 = 12.5%) */
  value: number | null;
  status: RatioStatus;
  inputs: RatioInput[];
  missing: StatementField[];
  note: string | null;
}

type Values = Record<StatementField, number>;
type Computation = { value: number } | { notMeaningful: string };

interface RatioDefinition {
  key: RatioKey;
  label: string;
  description: string;
  unit: RatioUnit;
  formula: string;
  higherIsBetter: boolean;
  /** Required statement fields (net debt components excluded, see usesNetDebt) */
  fields: StatementField[];
  usesNetDebt?: boolean;
  compute: (v: Values, netDebt: number) => Computation;
}

const nm = (reason: string): Computation => ({ notMeaningful: reason });

export const RATIO_DEFINITIONS: readonly RatioDefinition[] = [
  {
    key: "ebitda_margin",
    label: "EBITDA margin",
    description: "Redditività operativa lorda in rapporto ai ricavi.",
    unit: "percent",
    formula: "EBITDA / Ricavi",
    higherIsBetter: true,
    fields: ["ebitda", "revenue"],
    compute: (v) => (v.revenue <= 0 ? nm("Ricavi nulli o negativi: margine non significativo.") : { value: v.ebitda / v.revenue }),
  },
  {
    key: "ebit_margin",
    label: "EBIT margin",
    description: "Redditività operativa netta (dopo ammortamenti) in rapporto ai ricavi.",
    unit: "percent",
    formula: "EBIT / Ricavi",
    higherIsBetter: true,
    fields: ["ebit", "revenue"],
    compute: (v) => (v.revenue <= 0 ? nm("Ricavi nulli o negativi: margine non significativo.") : { value: v.ebit / v.revenue }),
  },
  {
    key: "net_debt",
    label: "PFN (Net Debt)",
    description: "Posizione finanziaria netta. Valore positivo = indebitamento netto; negativo = cassa netta.",
    unit: "currency",
    formula: "Debiti finanziari − Disponibilità liquide",
    higherIsBetter: false,
    fields: [],
    usesNetDebt: true,
    compute: (_v, netDebt) => ({ value: netDebt }),
  },
  {
    key: "net_debt_to_ebitda",
    label: "PFN / EBITDA",
    description: "Anni di EBITDA necessari per ripagare l'indebitamento netto.",
    unit: "multiple",
    formula: "(Debiti finanziari − Disponibilità liquide) / EBITDA",
    higherIsBetter: false,
    fields: ["ebitda"],
    usesNetDebt: true,
    compute: (v, netDebt) =>
      v.ebitda <= 0 ? nm("EBITDA nullo o negativo: indicatore non significativo.") : { value: netDebt / v.ebitda },
  },
  {
    key: "debt_to_ebitda",
    label: "Debiti finanziari / EBITDA",
    description: "Leva finanziaria lorda rispetto alla generazione di margine operativo.",
    unit: "multiple",
    formula: "Debiti finanziari / EBITDA",
    higherIsBetter: false,
    fields: ["financialDebt", "ebitda"],
    compute: (v) =>
      v.ebitda <= 0 ? nm("EBITDA nullo o negativo: indicatore non significativo.") : { value: v.financialDebt / v.ebitda },
  },
  {
    key: "current_ratio",
    label: "Current ratio",
    description: "Copertura delle passività a breve con l'attivo corrente.",
    unit: "multiple",
    formula: "Attivo corrente / Passivo corrente",
    higherIsBetter: true,
    fields: ["currentAssets", "currentLiabilities"],
    compute: (v) =>
      v.currentLiabilities <= 0
        ? nm("Passivo corrente nullo: indicatore non significativo.")
        : { value: v.currentAssets / v.currentLiabilities },
  },
  {
    key: "quick_ratio",
    label: "Quick ratio",
    description: "Copertura delle passività a breve escludendo le rimanenze.",
    unit: "multiple",
    formula: "(Attivo corrente − Rimanenze) / Passivo corrente",
    higherIsBetter: true,
    fields: ["currentAssets", "inventory", "currentLiabilities"],
    compute: (v) =>
      v.currentLiabilities <= 0
        ? nm("Passivo corrente nullo: indicatore non significativo.")
        : { value: (v.currentAssets - v.inventory) / v.currentLiabilities },
  },
  {
    key: "interest_coverage",
    label: "Interest coverage",
    description: "Quante volte il risultato operativo copre gli oneri finanziari.",
    unit: "multiple",
    formula: "EBIT / Oneri finanziari",
    higherIsBetter: true,
    fields: ["ebit", "interestExpense"],
    compute: (v) =>
      v.interestExpense <= 0
        ? nm("Oneri finanziari nulli: copertura non significativa.")
        : { value: v.ebit / v.interestExpense },
  },
  {
    key: "dscr",
    label: "DSCR",
    description: "Debt Service Coverage Ratio (semplificato): capacità dell'EBITDA di coprire il servizio del debito annuo.",
    unit: "multiple",
    formula: "EBITDA / (Oneri finanziari + Quota capitale annua)",
    higherIsBetter: true,
    fields: ["ebitda", "interestExpense", "principalRepayment"],
    compute: (v) => {
      const debtService = v.interestExpense + v.principalRepayment;
      return debtService <= 0 ? nm("Servizio del debito nullo: indicatore non significativo.") : { value: v.ebitda / debtService };
    },
  },
  {
    key: "net_debt_to_equity",
    label: "PFN / Patrimonio netto",
    description: "Indebitamento netto rispetto ai mezzi propri.",
    unit: "multiple",
    formula: "(Debiti finanziari − Disponibilità liquide) / Patrimonio netto",
    higherIsBetter: false,
    fields: ["equity"],
    usesNetDebt: true,
    compute: (v, netDebt) =>
      v.equity <= 0 ? nm("Patrimonio netto nullo o negativo: indicatore non significativo.") : { value: netDebt / v.equity },
  },
];

const DEFINITION_BY_KEY = new Map(RATIO_DEFINITIONS.map((d) => [d.key, d]));

export function getRatioDefinition(key: RatioKey): RatioDefinition {
  const def = DEFINITION_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown ratio: ${key}`);
  return def;
}

export function isRatioKey(key: string): key is RatioKey {
  return DEFINITION_BY_KEY.has(key as RatioKey);
}

const input = (field: StatementField, value: number | null | undefined): RatioInput => ({
  field,
  label: FIELD_LABELS[field],
  value: isFiniteNumber(value) ? value : null,
});

/** Net debt = financial debt − cash; falls back to the reported PFN when components are unavailable. */
export function resolveNetDebt(values: StatementValues): {
  value: number | null;
  inputs: RatioInput[];
  missing: StatementField[];
  note: string | null;
} {
  const { financialDebt, cash, netFinancialPosition } = values;
  if (isFiniteNumber(financialDebt) && isFiniteNumber(cash)) {
    return { value: financialDebt - cash, inputs: [input("financialDebt", financialDebt), input("cash", cash)], missing: [], note: null };
  }
  if (isFiniteNumber(netFinancialPosition)) {
    return {
      value: netFinancialPosition,
      inputs: [input("netFinancialPosition", netFinancialPosition)],
      missing: [],
      note: "PFN riportata nel documento sorgente: debiti finanziari e liquidità non disponibili separatamente.",
    };
  }
  const missing: StatementField[] = [];
  if (!isFiniteNumber(financialDebt)) missing.push("financialDebt");
  if (!isFiniteNumber(cash)) missing.push("cash");
  return { value: null, inputs: [input("financialDebt", financialDebt), input("cash", cash)], missing, note: null };
}

function round(value: number, unit: RatioUnit): number {
  const factor = unit === "currency" ? 100 : 1_000_000;
  return Math.round(value * factor) / factor;
}

export function computeRatio(key: RatioKey, values: StatementValues): RatioResult {
  const def = getRatioDefinition(key);
  const inputs: RatioInput[] = [];
  const missing: StatementField[] = [];
  let note: string | null = null;
  let netDebt = 0;

  if (def.usesNetDebt) {
    const nd = resolveNetDebt(values);
    inputs.push(...nd.inputs);
    missing.push(...nd.missing);
    note = nd.note;
    if (nd.value !== null) netDebt = nd.value;
  }
  for (const field of def.fields) {
    const value = values[field];
    inputs.push(input(field, value));
    if (!isFiniteNumber(value)) missing.push(field);
  }

  const base = {
    key: def.key,
    label: def.label,
    description: def.description,
    unit: def.unit,
    formula: def.formula,
    higherIsBetter: def.higherIsBetter,
    inputs,
  };

  if (missing.length > 0) {
    return {
      ...base,
      value: null,
      status: "MISSING",
      missing,
      note: `${NOT_AVAILABLE}: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.`,
    };
  }

  const result = def.compute(values as Values, netDebt);
  if ("notMeaningful" in result) {
    return { ...base, value: null, status: "NOT_MEANINGFUL", missing: [], note: result.notMeaningful };
  }
  if (!Number.isFinite(result.value)) {
    return { ...base, value: null, status: "NOT_MEANINGFUL", missing: [], note: "Risultato non calcolabile." };
  }
  if (def.usesNetDebt && netDebt < 0 && !note) {
    note = "Posizione di cassa netta: la liquidità supera i debiti finanziari (valore negativo).";
  }
  return { ...base, value: round(result.value, def.unit), status: "OK", missing: [], note };
}

export function computeRatios(values: StatementValues): RatioResult[] {
  return RATIO_KEYS.map((key) => computeRatio(key, values));
}

export function ratiosByKey(values: StatementValues): Record<RatioKey, RatioResult> {
  return Object.fromEntries(computeRatios(values).map((r) => [r.key, r])) as Record<RatioKey, RatioResult>;
}
