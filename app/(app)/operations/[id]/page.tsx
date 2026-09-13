import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/activity/timeline";
import { OperationStatusBadge } from "@/components/app/badges";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { ChecklistManager } from "@/components/operations/checklist-manager";
import { DeleteOperationButton, OperationStatusSelect, OperationSummaryPanel } from "@/components/operations/operation-controls";
import { OperationFormDialog } from "@/components/operations/operation-form-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { getAIStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { daysUntil } from "@/lib/dates";
import { netFeeAmount, netMonthlyRetainer } from "@/lib/economics/fee";
import { formatCurrency, formatDate, formatNumber } from "@/lib/financial/format";
import { DISCOUNT_TYPE_LABELS, FEE_TYPE_LABELS, OPERATION_SOURCE_LABELS, OPERATION_TYPE_LABELS, RATE_TYPE_LABELS } from "@/lib/labels";
import { can, NotFoundError } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { listDocuments } from "@/services/documents";
import { getLatestInsight } from "@/services/insights";
import { getOperation } from "@/services/operations";
import { listUsers } from "@/services/users";

export const metadata: Metadata = { title: "Operazione" };

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="num text-[13px] font-medium">{children ?? "—"}</dd>
    </div>
  );
}

export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const { id } = await params;
  let op;
  try {
    op = await getOperation(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const ai = getAIStatus();
  const [companies, users, documents, summary] = await Promise.all([
    listCompanies(ctx),
    listUsers(ctx),
    listDocuments(ctx, { companyId: op.companyId }),
    getLatestInsight(ctx, { kind: "OPERATION_SUMMARY", operationId: id }),
  ]);
  const canWrite = can(user.role, "operation:write");
  const days = op.maturityDate ? daysUntil(new Date(), op.maturityDate) : null;
  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Operazioni", href: "/operations" }, { label: op.company.name, href: `/companies/${op.companyId}` }, { label: op.title }]}
        title={
          <span className="flex items-center gap-2">
            {op.title} <OperationStatusBadge status={op.status} />
          </span>
        }
        description={
          <>
            <Link href={`/companies/${op.companyId}`} className="font-medium text-foreground hover:underline">
              {op.company.name}
            </Link>{" "}
            · {op.bank} · {OPERATION_TYPE_LABELS[op.type]}
          </>
        }
        actions={
          <>
            <OperationStatusSelect operationId={id} status={op.status} disabled={!canWrite} />
            {canWrite && (
              <>
                <OperationFormDialog companies={companyOptions} initial={op} />
                <DeleteOperationButton operationId={id} />
              </>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Condizioni">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4">
              <Info label="Importo">{op.amount !== null ? formatCurrency(op.amount) : null}</Info>
              <Info label="Debito residuo">{op.outstandingDebt !== null ? formatCurrency(op.outstandingDebt) : null}</Info>
              <Info label="Tasso">{op.rate !== null ? `${formatNumber(op.rate, 2)}%${op.rateType ? ` ${RATE_TYPE_LABELS[op.rateType].toLowerCase()}` : ""}` : null}</Info>
              <Info label="Durata">{op.durationMonths ? `${op.durationMonths} mesi` : null}</Info>
              <Info label="Data inizio">{op.startDate ? formatDate(op.startDate) : null}</Info>
              <Info label="Scadenza" className={cn(days !== null && days >= 0 && days <= 60 && op.status !== "REJECTED" && "[&_dd]:text-red-600")}>
                {op.maturityDate ? `${formatDate(op.maturityDate)}${days !== null && days >= 0 ? ` (tra ${days} gg)` : ""}` : null}
              </Info>
              <Info label="Probabilità">{op.probability !== null ? `${op.probability}%` : null}</Info>
              <Info label="Responsabile">{op.owner?.name}</Info>
              <Info label="Provenienza">{op.source === "ALTRO" && op.sourceDetail ? op.sourceDetail : OPERATION_SOURCE_LABELS[op.source]}</Info>
              <Info label="Garanzia" className="col-span-2">
                {op.guarantee}
              </Info>
              {op.notes && (
                <div className="col-span-2 sm:col-span-4">
                  <dt className="text-[11px] text-muted-foreground">Note</dt>
                  <dd className="whitespace-pre-wrap text-[13px]">{op.notes}</dd>
                </div>
              )}
            </dl>
          </Panel>

          {canWrite && (
            <Panel title="Dati economici" description="Fee di mediazione, sconti e retainer dello studio · visibile solo a chi gestisce le pratiche">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4">
                <Info label="Fee di mediazione">
                  {op.feeType ? `${op.feeType === "PERCENTAGE" ? `${formatNumber(op.feeValue ?? 0, 2)}%` : formatCurrency(op.feeValue ?? 0)} (${FEE_TYPE_LABELS[op.feeType]})` : null}
                </Info>
                <Info label="Sconto fee">
                  {op.feeDiscountType ? `${op.feeDiscountType === "PERCENTAGE" ? `${formatNumber(op.feeDiscountValue ?? 0, 2)}%` : formatCurrency(op.feeDiscountValue ?? 0)} (${DISCOUNT_TYPE_LABELS[op.feeDiscountType]})` : null}
                </Info>
                <Info label="Fee netta">{netFeeAmount(op) !== null ? formatCurrency(netFeeAmount(op)!) : null}</Info>
                <Info label="Retainer mensile">{op.monthlyRetainer !== null ? `${formatCurrency(op.monthlyRetainer)} / mese` : null}</Info>
                <Info label="Sconto retainer">
                  {op.retainerDiscountType
                    ? `${op.retainerDiscountType === "PERCENTAGE" ? `${formatNumber(op.retainerDiscountValue ?? 0, 2)}%` : formatCurrency(op.retainerDiscountValue ?? 0)} (${DISCOUNT_TYPE_LABELS[op.retainerDiscountType]})`
                    : null}
                </Info>
                <Info label="Retainer netto">{netMonthlyRetainer(op) !== null ? `${formatCurrency(netMonthlyRetainer(op)!)} / mese` : null}</Info>
                <Info label="Stato retainer">{op.retainerStartDate ? (op.retainerActive ? "Attivo" : "Terminato") : null}</Info>
                <Info label="Periodo retainer">
                  {op.retainerStartDate ? `${formatDate(op.retainerStartDate)} → ${op.retainerEndDate ? formatDate(op.retainerEndDate) : "in corso"}` : null}
                </Info>
              </dl>
            </Panel>
          )}

          <Panel title="Checklist documentale" description="Documenti richiesti per l'istruttoria">
            <ChecklistManager
              operationId={id}
              companyId={op.companyId}
              companyName={op.company.name}
              items={op.checklist}
              companyDocuments={documents.map((d) => ({ id: d.id, fileName: d.fileName, type: d.type, fiscalYear: d.fiscalYear }))}
              canManage={canWrite}
              canUpdate={can(user.role, "document:write")}
            />
          </Panel>

          <Panel
            title="Task"
            action={
              <TaskFormDialog
                options={{ companies: companyOptions, operations: [{ id, title: op.title, companyId: op.companyId }], users: users.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.name })) }}
                defaultCompanyId={op.companyId}
                defaultOperationId={id}
                currentUserId={user.id}
                size="xs"
                triggerLabel="Task"
              />
            }
          >
            <TaskList tasks={op.tasks} showCompany={false} emptyTitle="Nessun task per questa operazione" />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Documenti mancanti" description="Calcolati dalla checklist (obbligatori non ricevuti)">
            {op.missingDocuments.length === 0 ? (
              <p className="px-4 py-3 text-sm text-emerald-700">Tutti i documenti obbligatori sono stati ricevuti.</p>
            ) : (
              <ul className="divide-y" data-testid="missing-documents">
                {op.missingDocuments.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                    <span>{m.name}</span>
                    <span className={cn("text-xs", m.dueDate && daysUntil(new Date(), m.dueDate) < 0 ? "text-red-600" : "text-muted-foreground")}>
                      {m.status === "REQUESTED" ? "Richiesto" : "Mancante"}
                      {m.dueDate ? ` · entro ${formatDate(m.dueDate)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="AI summary">
            <OperationSummaryPanel operationId={id} companyId={op.companyId} insight={summary} aiConfigured={ai.configured} />
          </Panel>
          <Panel title="Timeline">
            <div className="p-4">
              <Timeline items={op.timeline} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
