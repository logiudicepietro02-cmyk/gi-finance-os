/** Aggregates studio-side economics (fee, retainer) across operations into a monthly trend. Pure: no I/O. */
import { OPEN_OPERATION_STATUSES } from "@/lib/labels";
import { netFeeAmount, netMonthlyRetainer, type DiscountTypeKey, type FeeTypeKey } from "./fee";

export interface PerformanceOperationInput {
  amount: unknown;
  status: string;
  closedAt: Date | string | null;
  feeType: FeeTypeKey | null;
  feeValue: unknown;
  feeDiscountType: DiscountTypeKey | null;
  feeDiscountValue: unknown;
  monthlyRetainer: unknown;
  retainerActive: boolean;
  retainerStartDate: Date | string | null;
  retainerEndDate: Date | string | null;
  retainerDiscountType: DiscountTypeKey | null;
  retainerDiscountValue: unknown;
}

export interface MonthlyPerformancePoint {
  /** "YYYY-MM" */
  month: string;
  label: string;
  feeRevenue: number;
  retainerRevenue: number;
}

export interface StudioPerformance {
  monthlyTrend: MonthlyPerformancePoint[];
  pipelineValue: number;
  activeMrr: number;
}

const MONTH_LABEL = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric" });
const OPEN_STATUSES = new Set<string>(OPEN_OPERATION_STATUSES);

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return typeof value === "string" ? new Date(value) : value;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsWindow(now: Date, count: number): Date[] {
  const months: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

/** Builds the studio's monthly revenue trend (fee da chiusure + retainer ricorrenti), pipeline value and active MRR. */
export function computeStudioPerformance(operations: PerformanceOperationInput[], opts: { now?: Date; months?: number } = {}): StudioPerformance {
  const now = opts.now ?? new Date();
  const window = monthsWindow(now, opts.months ?? 12);
  const trend: MonthlyPerformancePoint[] = window.map((d) => ({ month: monthKey(d), label: MONTH_LABEL.format(d), feeRevenue: 0, retainerRevenue: 0 }));
  const trendIndex = new Map(trend.map((point, i) => [point.month, i]));

  let pipelineValue = 0;
  let activeMrr = 0;

  for (const op of operations) {
    if (op.status === "COMPLETED") {
      const closedAt = toDate(op.closedAt);
      if (closedAt) {
        const idx = trendIndex.get(monthKey(closedAt));
        if (idx !== undefined) trend[idx].feeRevenue += netFeeAmount(op) ?? 0;
      }
    }

    if (OPEN_STATUSES.has(op.status)) {
      pipelineValue += netFeeAmount(op) ?? 0;
    }

    if (op.retainerActive) {
      activeMrr += netMonthlyRetainer(op) ?? 0;
    }

    const start = toDate(op.retainerStartDate);
    if (start) {
      const netRetainer = netMonthlyRetainer(op) ?? 0;
      if (netRetainer > 0) {
        const end = toDate(op.retainerEndDate) ?? now;
        const startMonth = startOfMonth(start);
        const endMonth = startOfMonth(end);
        for (const point of trend) {
          const [y, m] = point.month.split("-").map(Number);
          const pointMonth = new Date(y, m - 1, 1);
          if (pointMonth >= startMonth && pointMonth <= endMonth) point.retainerRevenue += netRetainer;
        }
      }
    }
  }

  return { monthlyTrend: trend, pipelineValue, activeMrr };
}
