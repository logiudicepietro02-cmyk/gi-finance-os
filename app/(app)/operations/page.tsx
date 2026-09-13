import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { OperationFormDialog } from "@/components/operations/operation-form-dialog";
import { OperationsTable } from "@/components/operations/operations-table";
import { requireUser } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/financial/format";
import { OPEN_OPERATION_STATUSES, OPERATION_STATUS_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { listOperations } from "@/services/operations";

export const metadata: Metadata = { title: "Operazioni" };

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ scope?: string; q?: string; new?: string; view?: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const sp = await searchParams;
  const scope = sp.scope === "open" || sp.scope === "closed" ? sp.scope : "all";
  const view = sp.view === "list" ? "list" : "board";
  const [operations, companies, openOps] = await Promise.all([
    listOperations(ctx, { scope, q: sp.q }),
    listCompanies(ctx),
    listOperations(ctx, { scope: "open" }),
  ]);
  const pipelineAmount = openOps.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const weighted = openOps.reduce((sum, o) => sum + (o.amount ?? 0) * ((o.probability ?? 0) / 100), 0);

  return (
    <>
      <PageHeader
        title="Operazioni finanziarie"
        description={`${openOps.length} in corso · pipeline ${formatCurrency(pipelineAmount, { compact: true })} · ponderata ${formatCurrency(weighted, { compact: true })}`}
        actions={can(user.role, "operation:write") && <OperationFormDialog companies={companies.map((c) => ({ id: c.id, name: c.name }))} defaultOpen={sp.new === "1"} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {(["board", "list"] as const).map((v) => (
            <Link key={v} href={`/operations?view=${v}${scope !== "all" ? `&scope=${scope}` : ""}`} className={cn("rounded px-2.5 py-1 text-xs font-medium", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {v === "board" ? "Pipeline" : "Elenco"}
            </Link>
          ))}
        </div>
        {view === "list" && (
          <div className="flex gap-1">
            {[
              { key: "all", label: "Tutte" },
              { key: "open", label: "In corso" },
              { key: "closed", label: "Chiuse" },
            ].map((s) => (
              <Link key={s.key} href={`/operations?view=list&scope=${s.key}`} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", scope === s.key ? "bg-muted" : "text-muted-foreground hover:bg-muted")}>
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {view === "board" ? (
        <div className="grid gap-3 overflow-x-auto pb-2 [grid-template-columns:repeat(6,minmax(220px,1fr))]" data-testid="operations-board">
          {OPEN_OPERATION_STATUSES.map((status) => {
            const items = openOps.filter((o) => o.status === status);
            const total = items.reduce((s, o) => s + (o.amount ?? 0), 0);
            return (
              <div key={status} className="flex min-w-0 flex-col rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-semibold">{OPERATION_STATUS_LABELS[status]}</span>
                  <span className="num text-[11px] text-muted-foreground">
                    {items.length} · {formatCurrency(total, { compact: true })}
                  </span>
                </div>
                <div className="space-y-2 p-2">
                  {items.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Nessuna</p>}
                  {items.map((op) => (
                    <Link key={op.id} href={`/operations/${op.id}`} className="block rounded-md border bg-card p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-primary/40">
                      <div className="truncate text-[13px] font-medium">{op.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {op.company.name} · {op.bank}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="num font-medium">{op.amount !== null ? formatCurrency(op.amount, { compact: true }) : "—"}</span>
                        {op.checklistSummary.required > 0 && (
                          <span className={cn("num", op.checklistSummary.missing.length ? "text-amber-700" : "text-emerald-700")}>
                            doc {op.checklistSummary.received}/{op.checklistSummary.required}
                          </span>
                        )}
                        {op.probability !== null && <span className="num text-muted-foreground">{op.probability}%</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Panel>
          <OperationsTable operations={operations} />
        </Panel>
      )}
    </>
  );
}
