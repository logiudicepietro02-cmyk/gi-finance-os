import { StatementStatusBadge } from "@/components/app/badges";
import { ratioTone } from "@/components/app/ratio-value";
import { RatioDetail } from "@/components/financial/ratio-detail";
import { FIELD_LABELS, NOT_AVAILABLE, type StatementField } from "@/lib/financial/fields";
import { formatCurrency, formatDelta, formatDeltaPct, formatRatio } from "@/lib/financial/format";
import type { RatioKey } from "@/lib/financial/ratios";
import type { Variation } from "@/lib/financial/variations";
import type { OrgSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { FinancialOverview } from "@/services/financials";

const FIELD_TILES: StatementField[] = ["revenue", "ebitda", "ebit", "netIncome"];
const RATIO_TILES: RatioKey[] = ["net_debt", "ebitda_margin", "net_debt_to_ebitda", "dscr"];

function DeltaChip({ variation }: { variation: Variation | undefined }) {
  if (!variation || variation.delta === null) return null;
  const text = variation.deltaPct !== null ? formatDeltaPct(variation.deltaPct) : formatDelta(variation.unit, variation.delta);
  return (
    <span
      className={cn(
        "num rounded px-1 text-[11px] font-medium",
        variation.favorable === true && "bg-emerald-50 text-emerald-700",
        variation.favorable === false && "bg-red-50 text-red-700",
        variation.favorable === null && "bg-muted text-muted-foreground",
      )}
    >
      {text}
    </span>
  );
}

export function KpiGrid({ overview, settings }: { overview: FinancialOverview; settings: OrgSettings }) {
  const latest = overview.latest;
  if (!latest) return null;
  const variation = (key: string) => overview.variations.find((v) => v.key === key);
  const equity = latest.values.equity ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          Bilancio {latest.fiscalYear}
          {overview.previous ? ` · variazioni rispetto al ${overview.previous.fiscalYear}` : ""}
        </span>
        <StatementStatusBadge status={latest.status} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5" data-testid="kpi-grid">
        {FIELD_TILES.map((field) => {
          const value = latest.values[field] ?? null;
          return (
            <div key={field} className="rounded-xl border-0 bg-card px-3.5 py-3 shadow-[var(--shadow-soft-sm)]">
              <div className="text-[11px] font-medium text-muted-foreground">{FIELD_LABELS[field]}</div>
              <div className={cn("num mt-0.5 text-lg font-semibold tracking-tight", value === null && "text-sm font-normal text-muted-foreground")}>
                {value === null ? NOT_AVAILABLE : formatCurrency(value, { compact: true })}
              </div>
              <DeltaChip variation={variation(field)} />
            </div>
          );
        })}
        <div className="rounded-xl border-0 bg-card px-3.5 py-3 shadow-[var(--shadow-soft-sm)]">
          <div className="text-[11px] font-medium text-muted-foreground">Patrimonio netto</div>
          <div className={cn("num mt-0.5 text-lg font-semibold tracking-tight", equity === null && "text-sm font-normal text-muted-foreground")}>
            {equity === null ? NOT_AVAILABLE : formatCurrency(equity, { compact: true })}
          </div>
          <DeltaChip variation={variation("equity")} />
        </div>
        {RATIO_TILES.map((key) => {
          const ratio = latest.ratios.find((r) => r.key === key)!;
          const tone = ratioTone(ratio, settings);
          return (
            <div key={key} className="rounded-xl border-0 bg-card px-3.5 py-3 shadow-[var(--shadow-soft-sm)]">
              <div className="text-[11px] font-medium text-muted-foreground">{ratio.label}</div>
              <RatioDetail ratio={ratio} fiscalYear={latest.fiscalYear}>
                <span
                  className={cn(
                    "num mt-0.5 block text-lg font-semibold tracking-tight",
                    ratio.status !== "OK" && "text-sm font-normal text-muted-foreground",
                    tone === "danger" && "text-red-600",
                    tone === "warning" && "text-amber-600",
                    tone === "success" && "text-emerald-700",
                  )}
                >
                  {ratio.status === "OK" ? formatRatio(ratio, { compact: true }) : ratio.status === "MISSING" ? NOT_AVAILABLE : "Non significativo"}
                </span>
              </RatioDetail>
              <DeltaChip variation={variation(key)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
