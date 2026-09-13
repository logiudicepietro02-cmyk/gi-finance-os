"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/financial/format";

export interface TrendPoint {
  year: number;
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  netDebt: number | null;
  ebitdaMargin: number | null;
  netDebtToEbitda: number | null;
  dscr: number | null;
}

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const compact = (v: number) => formatCurrency(v, { compact: true });

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-0 bg-card p-3.5 shadow-[var(--shadow-soft-sm)]">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="h-[200px]">{children}</div>
    </div>
  );
}

export function TrendCharts({ trend, dscrMin, netDebtEbitdaMax, full = false }: { trend: TrendPoint[]; dscrMin: number; netDebtEbitdaMax: number; full?: boolean }) {
  if (trend.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun bilancio disponibile per il trend.</p>;
  }
  const data = trend.map((p) => ({ ...p, label: String(p.year) }));

  return (
    <div className={full ? "grid gap-3 lg:grid-cols-3" : "grid gap-3 lg:grid-cols-2"} data-testid="trend-charts">
      <ChartCard title="Ricavi, EBITDA e margine">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
            <YAxis yAxisId="eur" tick={axis} axisLine={false} tickLine={false} tickFormatter={compact} width={56} />
            <YAxis yAxisId="pct" orientation="right" tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => formatPercent(v, 1)} width={44} />
            <Tooltip
              formatter={(value, name) => [name === "EBITDA margin" ? formatPercent(value as number) : formatCurrency(value as number), name]}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "var(--border)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
            <Bar yAxisId="eur" dataKey="revenue" name="Ricavi" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={36} />
            <Bar yAxisId="eur" dataKey="ebitda" name="EBITDA" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={36} />
            <Line yAxisId="pct" dataKey="ebitdaMargin" name="EBITDA margin" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Indebitamento: PFN e PFN/EBITDA">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
            <YAxis yAxisId="eur" tick={axis} axisLine={false} tickLine={false} tickFormatter={compact} width={56} />
            <YAxis yAxisId="x" orientation="right" tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => formatMultiple(v)} width={44} />
            <Tooltip
              formatter={(value, name) => [name === "PFN/EBITDA" ? formatMultiple(value as number) : formatCurrency(value as number), name]}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "var(--border)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
            <Bar yAxisId="eur" dataKey="netDebt" name="PFN" fill="var(--chart-5)" radius={[3, 3, 0, 0]} maxBarSize={36} />
            <Line yAxisId="x" dataKey="netDebtToEbitda" name="PFN/EBITDA" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <ReferenceLine yAxisId="x" y={netDebtEbitdaMax} stroke="var(--chart-4)" strokeDasharray="4 4" label={{ value: `soglia ${formatMultiple(netDebtEbitdaMax)}`, fontSize: 10, fill: "var(--chart-4)", position: "insideTopRight" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {full && (
        <ChartCard title="DSCR rispetto alla soglia">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => formatMultiple(v)} width={44} />
              <Tooltip formatter={(value) => [formatMultiple(value as number), "DSCR"]} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "var(--border)" }} />
              <Bar dataKey="dscr" name="DSCR" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={36} />
              <ReferenceLine y={dscrMin} stroke="var(--chart-4)" strokeDasharray="4 4" label={{ value: `soglia ${formatMultiple(dscrMin)}`, fontSize: 10, fill: "var(--chart-4)", position: "insideTopRight" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
