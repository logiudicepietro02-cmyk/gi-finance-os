import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanyStatusBadge, Pill, StatementStatusBadge } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { RatioValue } from "@/components/app/ratio-value";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { formatCurrency, formatDeltaPct } from "@/lib/financial/format";
import { COMPANY_STATUSES, COMPANY_STATUS_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { getOrganizationSettings } from "@/services/settings";
import { listUsers } from "@/services/users";

export const metadata: Metadata = { title: "Aziende" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; new?: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const params = await searchParams;
  const [companies, { settings }, users] = await Promise.all([
    listCompanies(ctx, { q: params.q, status: params.status }),
    getOrganizationSettings(ctx),
    listUsers(ctx),
  ]);
  const canWrite = can(user.role, "company:write");

  return (
    <>
      <PageHeader
        title="Aziende"
        description={`${companies.length} ${companies.length === 1 ? "cliente" : "clienti"} · indicatori dell'ultimo bilancio disponibile`}
        actions={canWrite && <CompanyFormDialog users={users.filter((u) => u.isActive)} defaultOpen={params.new === "1"} />}
      />

      <form className="mb-3 flex flex-wrap items-center gap-2" action="/companies">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={params.q} placeholder="Nome, P.IVA, città, settore" className="h-8 pl-8" />
        </div>
        <div className="flex items-center gap-1">
          {[{ key: "", label: "Tutte" }, ...COMPANY_STATUSES.map((s) => ({ key: s, label: COMPANY_STATUS_LABELS[s] }))].map((s) => (
            <Link
              key={s.key}
              href={`/companies?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(s.key ? { status: s.key } : {}) })}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                (params.status ?? "") === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </form>

      <Panel bodyClassName="overflow-x-auto">
        {companies.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Building2 />} title="Nessuna azienda trovata" description={params.q ? "Modifica i filtri di ricerca." : "Crea la prima azienda cliente."} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Azienda</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Consulente</TableHead>
                <TableHead className="text-right">Ricavi</TableHead>
                <TableHead className="text-right">Var. ricavi</TableHead>
                <TableHead className="text-right">EBITDA %</TableHead>
                <TableHead className="text-right">PFN/EBITDA</TableHead>
                <TableHead className="text-right">DSCR</TableHead>
                <TableHead className="text-center">Alert</TableHead>
                <TableHead className="text-center">Operazioni</TableHead>
                <TableHead className="pr-4 text-center">Task</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id} className="text-[13px]">
                  <TableCell className="pl-4">
                    <Link href={`/companies/${c.id}`} className="font-medium hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      {[c.sector, c.city && `${c.city}${c.province ? ` (${c.province})` : ""}`].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <CompanyStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.advisor?.name ?? "—"}</TableCell>
                  <TableCell className="num text-right">
                    {c.revenue !== null ? formatCurrency(c.revenue, { compact: true }) : <span className="text-muted-foreground">n.d.</span>}
                    <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                      {c.latestYear ? `${c.latestYear}` : c.revenue !== null ? "dichiarato" : ""}
                      {c.latestStatementStatus === "EXTRACTED" && <StatementStatusBadge status="EXTRACTED" />}
                    </div>
                  </TableCell>
                  <TableCell className={cn("num text-right", c.revenueGrowth !== null && (c.revenueGrowth < 0 ? "text-red-600" : "text-emerald-700"))}>
                    {c.revenueGrowth !== null ? formatDeltaPct(c.revenueGrowth) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <RatioValue ratio={c.ebitdaMargin} settings={settings} />
                  </TableCell>
                  <TableCell className="text-right">
                    <RatioValue ratio={c.netDebtToEbitda} settings={settings} />
                  </TableCell>
                  <TableCell className="text-right">
                    <RatioValue ratio={c.dscr} settings={settings} />
                  </TableCell>
                  <TableCell className="text-center">
                    {c.counts.alerts ? <Pill tone="warning">{c.counts.alerts}</Pill> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="num text-center">{c.counts.operations || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="num pr-4 text-center">{c.counts.tasks || <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
