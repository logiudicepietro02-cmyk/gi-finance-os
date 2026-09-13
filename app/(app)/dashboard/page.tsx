import { ArrowRight, CheckSquare, FilePlus2, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertList } from "@/components/alerts/alert-list";
import { OperationStatusBadge } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Panel, StatTile } from "@/components/app/panel";
import { DailyBriefingPanel } from "@/components/dashboard/daily-briefing";
import { StudioPerformanceChart } from "@/components/dashboard/studio-performance-chart";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { getAIStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { daysUntil, relativeDayLabel } from "@/lib/dates";
import { formatDate } from "@/lib/financial/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { contextFromUser } from "@/services/context";
import { getDashboard } from "@/services/dashboard";
import { getStudioPerformance } from "@/services/studio-performance";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(date: Date) {
  const h = date.getHours();
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

const SEVERITY_DOT = { CRITICAL: "bg-red-500", WARNING: "bg-amber-500", INFO: "bg-sky-500" } as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const canSeeStudioPerformance = can(user.role, "operation:write");
  const [data, studioPerformance] = await Promise.all([getDashboard(ctx), canSeeStudioPerformance ? getStudioPerformance(ctx) : Promise.resolve(null)]);
  const ai = getAIStatus();
  const now = new Date();
  const today = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const n = data.attention.length;

  return (
    <>
      <PageHeader
        title={`${greeting(now)}, ${user.name.split(" ")[0]}`}
        description={<span className="first-letter:uppercase">{today}</span>}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/documents?upload=1">
                <FilePlus2 /> Carica documento
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/tasks?new=1">
                <CheckSquare /> Nuovo task
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/ai">
                <Sparkles /> Chiedi al Copilot
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Task oggi" value={data.counts.tasksToday} href="/tasks?view=today" />
        <StatTile label="Prossimi 7 giorni" value={data.counts.tasksWeek} href="/tasks?view=week" />
        <StatTile label="Task scaduti" value={data.counts.tasksOverdue} tone={data.counts.tasksOverdue ? "danger" : "default"} href="/tasks?view=overdue" />
        <StatTile label="In attesa" value={data.counts.tasksWaiting} href="/tasks?view=waiting" />
        <StatTile label="Operazioni in corso" value={data.counts.operationsInProgress} href="/operations?scope=open" />
        <StatTile
          label="Documenti da verificare"
          value={data.counts.documentsToReview}
          tone={data.counts.documentsToReview ? "warning" : "default"}
          href="/documents?review=1"
          hint={data.counts.pendingApprovals ? `${data.counts.pendingApprovals} approvazioni in attesa` : undefined}
        />
        <StatTile
          label="Alert aperti"
          value={data.counts.alertsOpen}
          tone={data.counts.alertsCritical ? "danger" : data.counts.alertsOpen ? "warning" : "success"}
          hint={data.counts.alertsCritical ? `${data.counts.alertsCritical} critici` : undefined}
        />
      </div>

      {studioPerformance && (
        <Panel title="Andamento dello studio" description="Fee da pratiche chiuse, retainer ricorrenti e valore di pipeline · ultimi 12 mesi" className="mb-5">
          <div className="p-4">
            <StudioPerformanceChart performance={studioPerformance} />
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-4 text-violet-600" /> Briefing del giorno
              </span>
            }
            description="Priorità calcolate dal sistema su alert, variazioni, documenti e operazioni"
          >
            <div className="space-y-4 p-4">
              <p className="text-lg font-semibold tracking-tight" data-testid="attention-headline">
                {n === 0 ? "Nessun elemento richiede attenzione immediata." : `${n} ${n === 1 ? "elemento richiede" : "elementi richiedono"} la tua attenzione.`}
              </p>
              <DailyBriefingPanel briefing={data.dailyBriefing} aiConfigured={ai.configured} hasAttention={n > 0} />
              {n > 0 && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.attention.map((entry) => (
                    <div key={entry.companyId} className="rounded-md border bg-background/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Link href={`/companies/${entry.companyId}`} className="truncate text-sm font-semibold uppercase tracking-wide hover:text-primary">
                          {entry.companyName}
                        </Link>
                        <Link href={`/companies/${entry.companyId}`} className="text-muted-foreground hover:text-primary" aria-label={`Apri ${entry.companyName}`}>
                          <ArrowRight className="size-4" />
                        </Link>
                      </div>
                      <ul className="space-y-1.5">
                        {entry.items.map((item, i) => (
                          <li key={i} className="flex gap-2 text-[13px] leading-snug">
                            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", SEVERITY_DOT[item.severity])} />
                            <Link href={item.href} className="hover:underline">
                              {item.text}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Alert attivi" description="Generati da regole deterministiche · l'AI può suggerire l'azione successiva" action={<span className="num text-xs text-muted-foreground">{data.counts.alertsOpen}</span>}>
            <AlertList alerts={data.alerts} aiEnabled={ai.configured} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel
            title="Task in scadenza"
            action={
              <Link href="/tasks" className="text-xs font-medium text-primary hover:underline">
                Tutti i task
              </Link>
            }
          >
            <TaskList tasks={data.tasks} compact emptyTitle="Nessun task nei prossimi 7 giorni" />
          </Panel>

          <Panel
            title="Operazioni in corso"
            action={
              <Link href="/operations?scope=open" className="text-xs font-medium text-primary hover:underline">
                Pipeline
              </Link>
            }
          >
            {data.operations.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nessuna operazione in corso" />
              </div>
            ) : (
              <ul className="divide-y">
                {data.operations.map((op) => (
                  <li key={op.id}>
                    <Link href={`/operations/${op.id}`} className="block px-4 py-2.5 hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">{op.title}</span>
                        <OperationStatusBadge status={op.status} />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">
                          {op.company.name} · {op.bank}
                        </span>
                        {op.checklist.required > 0 && (
                          <span className={cn("num shrink-0", op.checklist.received < op.checklist.required && "text-amber-700")}>
                            Documenti {op.checklist.received}/{op.checklist.required}
                          </span>
                        )}
                      </div>
                      {op.maturityDate && daysUntil(now, new Date(op.maturityDate)) <= 60 && (
                        <div className="mt-0.5 text-[11px] text-red-600">Scadenza {formatDate(op.maturityDate)}</div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Documenti da verificare"
            action={
              <Link href="/documents?review=1" className="text-xs font-medium text-primary hover:underline">
                Revisione
              </Link>
            }
          >
            {data.documentsToReview.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nessun documento in attesa" />
              </div>
            ) : (
              <ul className="divide-y">
                {data.documentsToReview.map((d) => (
                  <li key={`${d.id}-${d.reason}`}>
                    <Link href={`/documents/${d.id}`} className="block px-4 py-2.5 hover:bg-muted/40">
                      <div className="truncate text-[13px] font-medium">{d.fileName}</div>
                      <div className="mt-0.5 flex justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">
                          {d.company?.name ?? "Senza azienda"} · {d.reason}
                        </span>
                        <span className="shrink-0">{relativeDayLabel(d.createdAt, now)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
