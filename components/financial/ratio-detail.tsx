"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatRatio } from "@/lib/financial/format";
import type { RatioResult } from "@/lib/financial/ratios";
import { cn } from "@/lib/utils";

/** Click on any ratio to see formula, inputs and result (spec: always show the formula). */
export function RatioDetail({ ratio, fiscalYear, children, className }: { ratio: RatioResult; fiscalYear?: number; children: React.ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("cursor-pointer text-left underline-offset-4 hover:underline decoration-dotted", className)} data-testid={`ratio-${ratio.key}`}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-xs" align="start">
        <div>
          <div className="text-sm font-semibold">
            {ratio.label}
            {fiscalYear ? <span className="ml-1 font-normal text-muted-foreground">· {fiscalYear}</span> : null}
          </div>
          <p className="text-muted-foreground">{ratio.description}</p>
        </div>
        <div className="rounded-md bg-muted px-2 py-1.5 font-mono text-[11px]" data-testid="ratio-formula">
          {ratio.formula}
        </div>
        <table className="w-full">
          <tbody>
            {ratio.inputs.map((input) => (
              <tr key={input.field} className="border-b last:border-0">
                <td className="py-1 text-muted-foreground">{input.label}</td>
                <td className={cn("num py-1 text-right", input.value === null && "text-red-600")}>{input.value === null ? "Dato non disponibile" : formatCurrency(input.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
          <span className="text-muted-foreground">Risultato</span>
          <span className="num text-sm font-semibold">{formatRatio(ratio)}</span>
        </div>
        {ratio.note && <p className={cn(ratio.status === "OK" ? "text-muted-foreground" : "text-amber-700")}>{ratio.note}</p>}
        <p className="text-[10px] text-muted-foreground">Calcolo deterministico eseguito dal sistema, non dall&apos;AI.</p>
      </PopoverContent>
    </Popover>
  );
}
