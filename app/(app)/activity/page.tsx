import type { Metadata } from "next";
import Link from "next/link";
import { Timeline } from "@/components/activity/timeline";
import { Pill } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, formatNumber } from "@/lib/financial/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listActivity, listAIRuns } from "@/services/activity";
import { contextFromUser } from "@/services/context";

export const metadata: Metadata = { title: "Attività" };

const ACTORS = [
  { key: "", label: "Tutti" },
  { key: "USER", label: "Utenti" },
  { key: "AI", label: "AI" },
  { key: "SYSTEM", label: "Sistema" },
];

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ actor?: string; view?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (!can(user.role, "audit:read")) {
    return (
      <>
        <PageHeader title="Attività" />
        <EmptyState title="Accesso riservato" description="Il registro attività è consultabile da Owner e Advisor. La timeline di ogni azienda resta disponibile nella scheda azienda." />
      </>
    );
  }
  const ctx = contextFromUser(user);
  const view = sp.view === "ai" ? "ai" : "log";
  const [items, runs] = await Promise.all([
    view === "log" ? listActivity(ctx, { actorType: sp.actor, limit: 300 }) : Promise.resolve([]),
    view === "ai" ? listAIRuns(ctx, { limit: 100 }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Attività e audit"
        description="Ogni azione di utenti, AI e sistema è registrata"
        actions={
          <Link href="/approvals" className="text-sm font-medium text-primary hover:underline">
            Approvazioni
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          <Link href="/activity" className={cn("rounded px-2.5 py-1 text-xs font-medium", view === "log" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            Registro attività
          </Link>
          <Link href="/activity?view=ai" className={cn("rounded px-2.5 py-1 text-xs font-medium", view === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            Esecuzioni AI
          </Link>
        </div>
        {view === "log" &&
          ACTORS.map((a) => (
            <Link key={a.key} href={a.key ? `/activity?actor=${a.key}` : "/activity"} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", (sp.actor ?? "") === a.key ? "bg-muted" : "text-muted-foreground hover:bg-muted")}>
              {a.label}
            </Link>
          ))}
      </div>

      {view === "log" ? (
        <Panel>
          <div className="p-4">
            <Timeline items={items} showCompany />
          </div>
          {items.some((i) => i.actorType === "AI" && i.toolName) && (
            <div className="border-t p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dettaglio chiamate ai tool (input/output)</div>
              <ul className="space-y-1.5">
                {items
                  .filter((i) => i.actorType === "AI" && i.toolName)
                  .slice(0, 40)
                  .map((i) => (
                    <li key={i.id}>
                      <details className="rounded-md border px-3 py-1.5 text-xs">
                        <summary className="cursor-pointer">
                          <span className="font-mono">{i.toolName}</span> · {formatDateTime(i.createdAt)} {i.companyName ? `· ${i.companyName}` : ""}{" "}
                          {(i.metadata as { ok?: boolean } | null)?.ok === false && <Pill tone="danger">errore</Pill>}
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">{JSON.stringify(i.metadata, null, 2)}</pre>
                      </details>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Panel>
      ) : (
        <Panel>
          {runs.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Nessuna esecuzione AI registrata" />
            </div>
          ) : (
            <ul className="divide-y">
              {runs.map((r) => (
                <li key={r.id} className="px-4 py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-medium">{r.kind.replace(/_/g, " ").toLowerCase()}</span>
                      <Pill tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "info"}>{r.status}</Pill>
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.provider}/{r.model}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)} · {r.userName ?? "sistema"}
                        {r.durationMs !== null ? ` · ${formatNumber(r.durationMs / 1000, 1)} s` : ""}
                        {r.inputTokens !== null ? ` · ${formatNumber(r.inputTokens)} in / ${formatNumber(r.outputTokens ?? 0)} out token` : ""}
                      </span>
                    </summary>
                    {r.error && <p className="mt-1 text-xs text-red-600">{r.error}</p>}
                    <div className="mt-2 grid gap-2 lg:grid-cols-2">
                      <pre className="max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">{JSON.stringify(r.input, null, 2)}</pre>
                      <pre className="max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">{JSON.stringify(r.output, null, 2)}</pre>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}
