import { FIELD_LABELS, isFiniteNumber, type StatementField, type StatementValues } from "./fields";
import { formatCurrency, formatDelta, formatDeltaPct, formatRatio } from "./format";
import { computeRatios, type RatioKey, type RatioResult, type RatioUnit } from "./ratios";

export interface Variation {
  key: StatementField | RatioKey;
  label: string;
  kind: "field" | "ratio";
  unit: RatioUnit;
  current: number | null;
  previous: number | null;
  delta: number | null;
  /** Relative change, only for amounts with a non-zero previous value */
  deltaPct: number | null;
  /** true = improvement, false = deterioration, null = neutral/unknown */
  favorable: boolean | null;
}

export interface SignificantChange {
  key: Variation["key"];
  label: string;
  message: string;
  favorable: boolean | null;
  severity: "INFO" | "WARNING";
  variation: Variation;
}

const FIELD_HIGHER_IS_BETTER: Partial<Record<StatementField, boolean>> = {
  revenue: true,
  ebitda: true,
  ebit: true,
  netIncome: true,
  cash: true,
  equity: true,
  financialDebt: false,
  netFinancialPosition: false,
  interestExpense: false,
};

const COMPARED_FIELDS: StatementField[] = ["revenue", "ebitda", "ebit", "netIncome", "cash", "financialDebt", "equity"];

function favorability(delta: number | null, higherIsBetter: boolean | undefined): boolean | null {
  if (delta === null || delta === 0 || higherIsBetter === undefined) return null;
  return delta > 0 === higherIsBetter;
}

export function computeVariations(
  current: StatementValues,
  previous: StatementValues,
  ratios?: { current: RatioResult[]; previous: RatioResult[] },
): Variation[] {
  const variations: Variation[] = [];

  for (const field of COMPARED_FIELDS) {
    const cur = current[field];
    const prev = previous[field];
    const delta = isFiniteNumber(cur) && isFiniteNumber(prev) ? cur - prev : null;
    const deltaPct = delta !== null && isFiniteNumber(prev) && prev !== 0 ? delta / Math.abs(prev) : null;
    variations.push({
      key: field,
      label: FIELD_LABELS[field],
      kind: "field",
      unit: "currency",
      current: isFiniteNumber(cur) ? cur : null,
      previous: isFiniteNumber(prev) ? prev : null,
      delta,
      deltaPct,
      favorable: favorability(delta, FIELD_HIGHER_IS_BETTER[field]),
    });
  }

  const curRatios = ratios?.current ?? computeRatios(current);
  const prevRatios = ratios?.previous ?? computeRatios(previous);
  for (const cur of curRatios) {
    const prev = prevRatios.find((r) => r.key === cur.key);
    const curVal = cur.status === "OK" ? cur.value : null;
    const prevVal = prev?.status === "OK" ? prev.value : null;
    const delta = curVal !== null && prevVal !== null ? curVal - prevVal : null;
    variations.push({
      key: cur.key,
      label: cur.label,
      kind: "ratio",
      unit: cur.unit,
      current: curVal,
      previous: prevVal,
      delta,
      deltaPct: cur.unit === "currency" && delta !== null && prevVal ? delta / Math.abs(prevVal) : null,
      favorable: favorability(delta, cur.higherIsBetter),
    });
  }
  return variations;
}

/** Thresholds for a change to be worth the advisor's attention. */
const SIGNIFICANCE: Partial<Record<Variation["key"], (v: Variation) => boolean>> = {
  revenue: (v) => v.deltaPct !== null && Math.abs(v.deltaPct) >= 0.1,
  ebitda: (v) => v.deltaPct !== null && Math.abs(v.deltaPct) >= 0.15,
  netIncome: (v) =>
    (v.current !== null && v.previous !== null && Math.sign(v.current) !== Math.sign(v.previous)) ||
    (v.deltaPct !== null && Math.abs(v.deltaPct) >= 0.25),
  equity: (v) => v.deltaPct !== null && Math.abs(v.deltaPct) >= 0.15,
  net_debt: (v) => v.delta !== null && Math.abs(v.delta) >= 100_000 && (v.deltaPct === null || Math.abs(v.deltaPct) >= 0.2),
  ebitda_margin: (v) => v.delta !== null && Math.abs(v.delta) >= 0.02,
  net_debt_to_ebitda: (v) => v.delta !== null && Math.abs(v.delta) >= 0.5,
  dscr: (v) => v.delta !== null && Math.abs(v.delta) >= 0.2,
  current_ratio: (v) => v.delta !== null && Math.abs(v.delta) >= 0.2,
};

function describe(v: Variation): string {
  const fmt = (value: number | null) =>
    v.unit === "currency"
      ? formatCurrency(value, { compact: true })
      : formatRatio({ unit: v.unit, value, status: value === null ? "MISSING" : "OK" } as RatioResult);
  const change = v.deltaPct !== null ? formatDeltaPct(v.deltaPct) : formatDelta(v.unit, v.delta);
  return `${v.label} ${change} (${fmt(v.previous)} → ${fmt(v.current)})`;
}

export function significantChanges(variations: Variation[]): SignificantChange[] {
  return variations
    .filter((v) => SIGNIFICANCE[v.key]?.(v))
    .map((v) => ({
      key: v.key,
      label: v.label,
      message: describe(v),
      favorable: v.favorable,
      severity: v.favorable === false ? "WARNING" : "INFO",
      variation: v,
    }));
}
