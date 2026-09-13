import { ratioTone } from "@/components/app/ratio-value";
import { RatioDetail } from "@/components/financial/ratio-detail";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRatio } from "@/lib/financial/format";
import { RATIO_DEFINITIONS } from "@/lib/financial/ratios";
import type { OrgSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { SerializedStatement } from "@/services/financials";

export function RatiosTable({ statements, settings }: { statements: SerializedStatement[]; settings: OrgSettings }) {
  const years = statements.slice(-5);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" data-testid="ratios-table">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Indicatore</th>
            <th className="px-3 py-2 text-left font-medium">Formula</th>
            {years.map((s) => (
              <th key={s.id} className="num px-3 py-2 text-right font-medium">
                {s.fiscalYear}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RATIO_DEFINITIONS.map((def) => (
            <tr key={def.key} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2 font-medium">{def.label}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{def.formula}</td>
              {years.map((s) => {
                const r = s.ratios.find((x) => x.key === def.key)!;
                const tone = ratioTone(r, settings);
                return (
                  <td key={s.id} className="px-3 py-2 text-right">
                    {r.status === "OK" ? (
                      <RatioDetail ratio={r} fiscalYear={s.fiscalYear}>
                        <span className={cn("num", tone === "danger" && "font-medium text-red-600", tone === "warning" && "font-medium text-amber-600", tone === "success" && "text-emerald-700")}>
                          {formatRatio(r, { compact: true })}
                        </span>
                      </RatioDetail>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help text-xs text-muted-foreground">{r.status === "MISSING" ? "n.d." : "n.s."}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{r.note}</TooltipContent>
                      </Tooltip>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-muted-foreground">
        n.d. = dato non disponibile · n.s. = non significativo. Clicca su un valore per formula e input.
      </p>
    </div>
  );
}
