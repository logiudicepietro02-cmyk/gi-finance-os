import { NOT_AVAILABLE, isFiniteNumber } from "./fields";
import type { RatioResult, RatioUnit } from "./ratios";

export { NOT_AVAILABLE };

const nf0 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (!isFiniteNumber(value)) return NOT_AVAILABLE;
  return (digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(value);
}

export function formatCurrency(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (!isFiniteNumber(value)) return NOT_AVAILABLE;
  if (opts.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${nf1.format(value / 1_000_000)} M€`;
    if (abs >= 1_000) return `${nf0.format(value / 1_000)} k€`;
  }
  return `${nf0.format(value)} €`;
}

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (!isFiniteNumber(fraction)) return NOT_AVAILABLE;
  return `${(digits === 2 ? nf2 : nf1).format(fraction * 100)}%`;
}

export function formatMultiple(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NOT_AVAILABLE;
  return `${nf2.format(value)}x`;
}

export function formatByUnit(unit: RatioUnit, value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (unit === "percent") return formatPercent(value);
  if (unit === "currency") return formatCurrency(value, opts);
  return formatMultiple(value);
}

/** Display value of a ratio, including the reason when it can't be shown. */
export function formatRatio(result: RatioResult, opts: { compact?: boolean } = {}): string {
  if (result.status === "MISSING") return NOT_AVAILABLE;
  if (result.status === "NOT_MEANINGFUL") return "n.s.";
  return formatByUnit(result.unit, result.value, opts);
}

/** Absolute change: percentage points for percent ratios. */
export function formatDelta(unit: RatioUnit, delta: number | null | undefined): string {
  if (!isFiniteNumber(delta)) return "—";
  const abs = Math.abs(delta);
  if (unit === "percent") return `${sign(delta)}${nf1.format(abs * 100)} pp`;
  if (unit === "currency") return `${sign(delta)}${formatCurrency(abs, { compact: true })}`;
  return `${sign(delta)}${nf2.format(abs)}x`;
}

export function formatDeltaPct(fraction: number | null | undefined): string {
  if (!isFiniteNumber(fraction)) return "—";
  return `${sign(fraction)}${nf1.format(Math.abs(fraction) * 100)}%`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

/** "EBITDA / Ricavi = 1.500.000 € / 10.000.000 € = 15,0%" */
export function formulaWithValues(result: RatioResult): string {
  const inputs = result.inputs.map((i) => `${i.label} ${formatCurrency(i.value)}`).join(" · ");
  return `${result.formula} → ${inputs} → ${formatRatio(result)}`;
}
