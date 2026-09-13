"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatTile } from "@/components/app/panel";
import { formatCurrency } from "@/lib/financial/format";
import type { StudioPerformance } from "@/services/studio-performance";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const compact = (v: number) => formatCurrency(v, { compact: true });

export function StudioPerformanceChart({ performance }: { performance: StudioPerformance }) {
  const { monthlyTrend, pipelineValue, activeMrr } = performance;
  const hasData = monthlyTrend.some((p) => p.feeRevenue > 0 || p.retainerRevenue > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Valore pipeline" value={compact(pipelineValue)} hint="Fee potenziali sulle pratiche aperte" tone="hero" />
        <StatTile label="Retainer ricorrenti attivi" value={compact(activeMrr)} hint="€/mese, pratiche con retainer attivo" />
      </div>
      {hasData ? (
        <div className="h-[220px] rounded-xl border-0 bg-card p-3.5 shadow-[var(--shadow-soft-sm)]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compact} width={56} />
              <Tooltip formatter={(value, name) => [formatCurrency(value as number), name]} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "var(--border)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
              <Bar dataKey="feeRevenue" name="Fee da chiusure" stackId="revenue" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={36} />
              <Bar dataKey="retainerRevenue" name="Retainer ricorrenti" stackId="revenue" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={36} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun ricavo registrato negli ultimi 12 mesi.</p>
      )}
    </div>
  );
}
