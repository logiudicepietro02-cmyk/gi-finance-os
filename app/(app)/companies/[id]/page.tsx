import { AlertTriangle, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/activity/timeline";
import { BriefingView } from "@/components/ai/briefing-view";
import { CopilotSheet } from "@/components/ai/copilot-sheet";
import { InterpretationPanel } from "@/components/ai/interpretation-panel";
import { AlertList } from "@/components/alerts/alert-list";
import { CompanyStatusBadge, Pill } from "@/components/app/badges";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { KpiGrid } from "@/components/financial/kpi-grid";
import { RatiosTable } from "@/components/financial/ratios-table";
import { StatementsTable } from "@/components/financial/statements-table";
import { TrendCharts } from "@/components/financial/trend-charts";
import { OperationFormDialog } from "@/components/operations/operation-form-dialog";
import { OperationsTable } from "@/components/operations/operations-table";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { getAIStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { formatCurrency, formatMultiple } from "@/lib/financial/format";
import { can, NotFoundError } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listActivity } from "@/services/activity";
import { listAlerts } from "@/services/alerts";
import { getCompany, listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { listDocuments } from "@/services/documents";
import { getFinancialOverview } from "@/services/financials";
import { getLatestInsight, listInsights } from "@/services/insights";
import { listOperations } from "@/services/operations";
import { getOrganizationSettings } from "@/services/settings";
import { listTasks } from "@/services/tasks";
import { listUsers } from "@/services/users";

export const metadata: Metadata = { title: "Azienda" };

const TABS = [
  { key: "overview", label: "Panoramica" },
  { key: "analysis", label: "Analisi finanziaria" },
  { key: "financing", label: "Finanziamenti" },
  { key: "documents", label: "Documenti" },
  { key: "tasks", label: "Task" },
  { key: "timeline", label: "Timeline" },
  { key: "briefing", label: "Briefing" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children ?? "—"}</dd>
    </div>
  );
}

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; copilot?: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const { id } = await params;
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "overview";

  let company;
  try {
    company = await getCompany(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const ai = getAIStatus();
  const [overview, { settings }, alerts, operations, tasks, documents, users, companies] = await Promise.all([
    getFinancialOverview(ctx, id),
    getOrganizationSettings(ctx),
    listAlerts(ctx, { companyId: id }),
    listOperations(ctx, { companyId: id }),
    listTasks(ctx, { companyId: id, view: tab === "tasks" ? "all" : "open" }),
    listDocuments(ctx, { companyId: id }),
    listUsers(ctx),
    listCompanies(ctx),
  ]);
  const [interpretation, briefing, variations, timeline] = await Promise.all([
    tab === "analysis" ? getLatestInsight(ctx, { kind: "FINANCIAL_INTERPRETATION", companyId: id }) : null,
    tab === "briefing" ? getLatestInsight(ctx, { kind: "CLIENT_BRIEFING", companyId: id }) : null,
    tab === "overview" ? listInsights(ctx, { companyId: id, kinds: ["VARIATION", "DOCUMENT_INSIGHT"], limit: 12 }) : [],
    tab === "timeline" || tab === "overview" ? listActivity(ctx, { companyId: id, limit: tab === "timeline" ? 200 : 8 }) : [],
  ]);

  const openOps = operations.filter((o) => !["COMPLETED", "REJECTED"].includes(o.status));
  const activeUsers = users.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.name }));
  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));
  const taskOptions = { companies: companyOptions, operations: operations.map((o) => ({ id: o.id, title: o.title, companyId: o.companyId })), users: activeUsers };
  const counts: Partial<Record<TabKey, number>> = { financing: openOps.length, documents: documents.length, tasks: tasks.filter((t) => t.status !== "DONE").length };
  const trend3 = overview.trend.slice(-3);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Aziende", href: "/companies" }, { label: company.name }]}
        title={
          <span className="flex items-center gap-2">
            {company.name} <CompanyStatusBadge status={company.status} />
          </span>
        }
        description={[company.vatNumber && `P.IVA ${company.vatNumber}`, company.sector, company.city && `${company.city}${company.province ? ` (${company.province})` : ""}`, company.assignedAdvisor && `Consulente: ${company.assignedAdvisor.name}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {can(user.role, "company:write") && (
              <CompanyFormDialog
                users={activeUsers}
                initial={company}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil /> Modifica
                  </Button>
                }
              />
            )}
            <UploadDialog companies={companyOptions} defaultCompanyId={id} triggerVariant="outline" />
            <CopilotSheet companyId={id} companyName={company.name} aiConfigured={ai.configured} aiReason={ai.reason} defaultOpen={sp.copilot === "1"} />
          </>
        }
      />

      {overview.pendingExtractions.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {overview.pendingExtractions.length === 1 ? "Un'estrazione di dati finanziari è" : `${overview.pendingExtractions.length} estrazioni sono`} in attesa di verifica.
          </span>
          <Link href={`/documents/${overview.pendingExtractions[0].documentId}`} className="ml-auto font-medium underline-offset-2 hover:underline">
            Verifica ora
          </Link>
        </div>
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b" aria-label="Sezioni azienda">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/companies/${id}${t.key === "overview" ? "" : `?tab=${t.key}`}`}
            className={cn(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
            {counts[t.key] ? <span className="num rounded bg-muted px-1 text-[11px] text-muted-foreground">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            {overview.latest ? (
              <KpiGrid overview={overview} settings={settings} />
            ) : (
              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <span className="text-muted-foreground">Nessun bilancio disponibile: carica un bilancio per ottenere dati, indicatori e trend.</span>
                  <UploadDialog companies={companyOptions} defaultCompanyId={id} defaultType="BILANCIO" triggerLabel="Carica bilancio" />
                </div>
              </Panel>
            )}
            {trend3.length > 0 && <TrendCharts trend={trend3} dscrMin={settings.dscrMin} netDebtEbitdaMax={settings.netDebtEbitdaMax} />}
            <Panel title="Alert" description="Regole deterministiche su DSCR, PFN/EBITDA, scadenze, documenti e task">
              <AlertList alerts={alerts} aiEnabled={ai.configured} showCompany={false} />
            </Panel>
            {variations.length > 0 && (
              <Panel title="Cosa è cambiato" description="Variazioni significative rilevate dal sistema e sintesi dei documenti">
                <ul className="divide-y">
                  {variations.map((v) => {
                    const favorable = (v.content as { favorable?: boolean | null } | null)?.favorable;
                    return (
                      <li key={v.id} className="flex items-start gap-2 px-4 py-2 text-[13px]">
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", v.kind === "DOCUMENT_INSIGHT" ? "bg-violet-500" : favorable === false ? "bg-red-500" : favorable ? "bg-emerald-500" : "bg-muted-foreground")} />
                        <div className="min-w-0">
                          <div>{v.title}</div>
                          {v.summary && <div className="text-xs text-muted-foreground">{v.kind === "VARIATION" ? `Confronto ${v.summary}` : v.summary}</div>}
                        </div>
                        <Pill tone={v.source === "AI" ? "violet" : "info"} className="ml-auto">
                          {v.source === "AI" ? "AI" : "Calcolo"}
                        </Pill>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}
          </div>

          <div className="min-w-0 space-y-5">
            <Panel title="Anagrafica">
              <dl className="divide-y px-4 py-1">
                <Field label="Ragione sociale">{company.name}</Field>
                <Field label="P.IVA / C.F.">{company.vatNumber ?? company.taxCode}</Field>
                <Field label="Settore">{company.sector}</Field>
                <Field label="ATECO">{company.atecoCode}</Field>
                <Field label="Sede">{company.city ? `${company.city}${company.province ? ` (${company.province})` : ""}` : null}</Field>
                <Field label="Fatturato">
                  {overview.latest?.values.revenue ? (
                    <span className="num">
                      {formatCurrency(overview.latest.values.revenue, { compact: true })} <span className="text-xs font-normal text-muted-foreground">({overview.latest.fiscalYear})</span>
                    </span>
                  ) : company.declaredRevenue ? (
                    <span className="num">
                      {formatCurrency(company.declaredRevenue, { compact: true })} <span className="text-xs font-normal text-muted-foreground">(dichiarato)</span>
                    </span>
                  ) : null}
                </Field>
                <Field label="Dipendenti">{company.employees}</Field>
                <Field label="Consulente">{company.assignedAdvisor?.name}</Field>
                <Field label="Stato cliente">
                  <CompanyStatusBadge status={company.status} />
                </Field>
              </dl>
              {company.contacts.length > 0 && (
                <div className="border-t px-4 py-2.5">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Referenti</div>
                  {company.contacts.map((c) => (
                    <div key={c.id} className="text-[13px]">
                      <span className="font-medium">{c.name}</span>
                      {c.role && <span className="text-muted-foreground"> · {c.role}</span>}
                      <div className="text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                    </div>
                  ))}
                </div>
              )}
              {company.description && <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">{company.description}</p>}
            </Panel>

            <Panel
              title="Task aperti"
              action={<TaskFormDialog options={taskOptions} defaultCompanyId={id} currentUserId={user.id} size="xs" triggerLabel="Task" />}
            >
              <TaskList tasks={tasks.filter((t) => t.status !== "DONE").slice(0, 6)} compact showCompany={false} emptyTitle="Nessun task aperto" />
            </Panel>

            <Panel title="Attività recente" action={<Link href={`/companies/${id}?tab=timeline`} className="text-xs font-medium text-primary hover:underline">Timeline</Link>}>
              <div className="px-4 py-3">
                <Timeline items={timeline} />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === "analysis" && (
        <div className="space-y-5">
          {overview.latest ? <KpiGrid overview={overview} settings={settings} /> : null}
          <TrendCharts trend={overview.trend} dscrMin={settings.dscrMin} netDebtEbitdaMax={settings.netDebtEbitdaMax} full />
          <Panel
            title="Ratios"
            description="Calcolati dal financial engine deterministico"
            action={
              <span className="num text-xs text-muted-foreground">
                Soglie: DSCR min {formatMultiple(settings.dscrMin)} · PFN/EBITDA max {formatMultiple(settings.netDebtEbitdaMax)}
              </span>
            }
          >
            {overview.statements.length ? <RatiosTable statements={overview.statements} settings={settings} /> : <p className="p-4 text-sm text-muted-foreground">Nessun bilancio disponibile.</p>}
          </Panel>
          <Panel title="Dati di bilancio" description="Valori normalizzati con fonte per ogni campo">
            <StatementsTable
              companyId={id}
              statements={overview.statements}
              canWrite={can(user.role, "financials:write")}
              canApprove={can(user.role, "financials:approve")}
            />
          </Panel>
          <Panel title="AI Interpretation" description="Situazione, positività, criticità, variazioni, rischi e azioni">
            <InterpretationPanel companyId={id} insight={interpretation} aiConfigured={ai.configured} hasStatements={overview.statements.length > 0} />
          </Panel>
        </div>
      )}

      {tab === "financing" && (
        <Panel
          title="Operazioni finanziarie"
          description="Banca, tipo, importo, debito residuo, tasso, scadenza e stato"
          action={can(user.role, "operation:write") && <OperationFormDialog companies={companyOptions} defaultCompanyId={id} />}
        >
          <OperationsTable operations={operations} showCompany={false} />
        </Panel>
      )}

      {tab === "documents" && (
        <Panel title="Documenti" action={<UploadDialog companies={companyOptions} defaultCompanyId={id} />}>
          <DocumentsTable documents={documents} showCompany={false} />
        </Panel>
      )}

      {tab === "tasks" && (
        <Panel title="Task" action={<TaskFormDialog options={taskOptions} defaultCompanyId={id} currentUserId={user.id} />}>
          <TaskList tasks={tasks} showCompany={false} emptyTitle="Nessun task per questa azienda" />
        </Panel>
      )}

      {tab === "timeline" && (
        <Panel title="Timeline" description="Documenti, operazioni, analisi AI, task e modifiche">
          <div className="p-4">
            <Timeline items={timeline} />
          </div>
        </Panel>
      )}

      {tab === "briefing" && (
        <Panel title="Client briefing" description="Pronto per il prossimo incontro con l'imprenditore">
          <BriefingView companyId={id} companyName={company.name} insight={briefing} aiConfigured={ai.configured} />
        </Panel>
      )}
    </>
  );
}
