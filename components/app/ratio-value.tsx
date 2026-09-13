import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRatio, NOT_AVAILABLE } from "@/lib/financial/format";
import type { RatioResult } from "@/lib/financial/ratios";
import type { OrgSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Tone of a ratio against the organization's thresholds (deterministic, same rules as the alert engine). */
export function ratioTone(r: Pick<RatioResult, "key" | "value" | "status">, settings: OrgSettings): "danger" | "warning" | "success" | "neutral" {
  if (r.status !== "OK" || r.value === null) return "neutral";
  switch (r.key) {
    case "dscr":
      return r.value < 1 ? "danger" : r.value < settings.dscrMin ? "warning" : "success";
    case "net_debt_to_ebitda":
      return r.value > settings.netDebtEbitdaMax * 1.5 ? "danger" : r.value > settings.netDebtEbitdaMax ? "warning" : "neutral";
    case "current_ratio":
      return r.value < 1 ? "warning" : "neutral";
    default:
      return "neutral";
  }
}

const TONE_CLASS = {
  danger: "text-red-600",
  warning: "text-amber-600",
  success: "text-emerald-700",
  neutral: "",
};

export function RatioValue({ ratio, settings, compact }: { ratio: RatioResult | null; settings: OrgSettings; compact?: boolean }) {
  if (!ratio) return <span className="text-muted-foreground">—</span>;
  const tone = ratioTone(ratio, settings);
  if (ratio.status !== "OK") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help text-muted-foreground">{ratio.status === "MISSING" ? "n.d." : "n.s."}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{ratio.note ?? NOT_AVAILABLE}</TooltipContent>
      </Tooltip>
    );
  }
  return <span className={cn("num font-medium", TONE_CLASS[tone])}>{formatRatio(ratio, { compact })}</span>;
}
