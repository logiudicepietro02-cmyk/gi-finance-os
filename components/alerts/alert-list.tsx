"use client";

import { Check, ListPlus, Loader2, MoreHorizontal, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Pill, PriorityBadge, SeverityBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, errorText } from "@/lib/client/api";
import { relativeDayLabel } from "@/lib/dates";
import type { TaskPriorityKey } from "@/lib/labels";

export interface AlertItem {
  id: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  title: string;
  message: string;
  firstDetectedAt: Date | string;
  companyId: string | null;
  company: { id: string; name: string } | null;
  insights?: { id: string; content: unknown }[];
}

interface NextBestAction {
  recommended_action: string;
  reason: string;
  priority: TaskPriorityKey;
  confidence: number;
  model?: string;
}

export function AlertList({ alerts, aiEnabled, showCompany = true }: { alerts: AlertItem[]; aiEnabled: boolean; showCompany?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  if (alerts.length === 0) {
    return <EmptyState title="Nessun alert attivo" description="Le regole deterministiche non rilevano condizioni che richiedono intervento." />;
  }

  return (
    <ul className="divide-y" data-testid="alert-list">
      {alerts.map((alert) => {
        const nba = alert.insights?.[0]?.content as NextBestAction | undefined;
        return (
          <li key={alert.id} className="flex gap-3 px-4 py-3">
            <div className="pt-0.5">
              <SeverityBadge severity={alert.severity} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{alert.title}</span>
                {showCompany && alert.company && (
                  <Link href={`/companies/${alert.company.id}`} className="text-xs font-medium text-primary hover:underline">
                    {alert.company.name}
                  </Link>
                )}
                {alert.status === "ACKNOWLEDGED" && <Pill tone="info">Preso in carico</Pill>}
                <span className="text-[11px] text-muted-foreground">rilevato {relativeDayLabel(alert.firstDetectedAt)}</span>
              </div>
              <p className="text-[13px] text-muted-foreground">{alert.message}</p>
              {nba && (
                <div className="mt-2 rounded-md border border-violet-200/70 bg-violet-50/50 p-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-violet-700">
                    <Sparkles className="size-3.5" /> Next best action
                    <PriorityBadge priority={nba.priority} />
                    <span className="text-violet-600/80">confidenza {Math.round(nba.confidence * 100)}%</span>
                  </div>
                  <p className="text-[13px] font-medium">{nba.recommended_action}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{nba.reason}</p>
                  <Button
                    size="xs"
                    variant="outline"
                    className="mt-2"
                    disabled={busy === `task-${alert.id}`}
                    onClick={() =>
                      run(
                        `task-${alert.id}`,
                        () =>
                          api("/api/tasks", {
                            body: {
                              title: nba.recommended_action.slice(0, 200),
                              description: nba.reason,
                              companyId: alert.companyId,
                              alertId: alert.id,
                              priority: nba.priority,
                              source: "ALERT",
                            },
                          }),
                        "Task creato dall'azione suggerita",
                      )
                    }
                  >
                    <ListPlus /> Crea task
                  </Button>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-start gap-1">
              {aiEnabled && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-violet-700"
                  disabled={busy === `nba-${alert.id}`}
                  onClick={() => run(`nba-${alert.id}`, () => api(`/api/alerts/${alert.id}/next-action`, { method: "POST" }), "Azione suggerita generata")}
                >
                  {busy === `nba-${alert.id}` ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {nba ? "Rigenera" : "Suggerisci azione"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-xs" variant="ghost" aria-label="Azioni alert">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {alert.status === "OPEN" && (
                    <DropdownMenuItem onSelect={() => run(`ack-${alert.id}`, () => api(`/api/alerts/${alert.id}`, { method: "PATCH", body: { action: "acknowledge" } }), "Alert preso in carico")}>
                      <Check /> Prendi in carico
                    </DropdownMenuItem>
                  )}
                  {alert.companyId && (
                    <DropdownMenuItem asChild>
                      <Link href={`/companies/${alert.companyId}`}>Apri azienda</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => run(`dismiss-${alert.id}`, () => api(`/api/alerts/${alert.id}`, { method: "PATCH", body: { action: "dismiss" } }), "Alert archiviato")}>
                    <X /> Archivia
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
