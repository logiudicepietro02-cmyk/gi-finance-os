"use client";

import { Check, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Pill, PriorityBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/client/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/financial/format";
import type { TaskPriorityKey } from "@/lib/labels";

export interface ApprovalView {
  id: string;
  type: "CREATE_TASK" | "UPDATE_FINANCIAL_STATEMENT";
  status: string;
  title: string;
  reason: string | null;
  payload: unknown;
  createdAt: Date | string;
  decidedAt: Date | string | null;
  company: { id: string; name: string } | null;
}

export function ApprovalsList({ approvals, canDecide }: { approvals: ApprovalView[]; canDecide: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(id + decision);
    try {
      await api(`/api/approvals/${id}`, { body: { decision } });
      toast.success(decision === "APPROVE" ? "Richiesta approvata" : "Richiesta rifiutata");
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  if (approvals.length === 0) return <EmptyState title="Nessuna richiesta" description="Le azioni dell'AI che richiedono approvazione compaiono qui." />;

  return (
    <ul className="divide-y">
      {approvals.map((a) => {
        const payload = a.payload as Record<string, unknown>;
        const changes = (payload.changes as { field: string; label: string; current: number | null; proposed: number | null }[] | undefined) ?? [];
        return (
          <li key={a.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={a.type === "CREATE_TASK" ? "violet" : "warning"}>{a.type === "CREATE_TASK" ? "Task proposto dall'AI" : "Modifica dati finanziari"}</Pill>
              <span className="text-sm font-medium">{a.title}</span>
              {a.company && (
                <Link href={`/companies/${a.company.id}`} className="text-xs text-primary hover:underline">
                  {a.company.name}
                </Link>
              )}
              <span className="text-[11px] text-muted-foreground">{formatDateTime(a.createdAt)}</span>
            </div>
            {a.reason && <p className="text-xs text-muted-foreground">{a.reason}</p>}
            {a.type === "CREATE_TASK" && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {typeof payload.priority === "string" && <PriorityBadge priority={payload.priority as TaskPriorityKey} />}
                {typeof payload.dueDate === "string" && <span>Scadenza {formatDate(payload.dueDate)}</span>}
                {typeof payload.description === "string" && <span className="text-muted-foreground">{payload.description}</span>}
              </div>
            )}
            {changes.length > 0 && (
              <table className="w-full max-w-lg text-xs">
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field} className="border-b last:border-0">
                      <td className="py-0.5">{c.label}</td>
                      <td className="num py-0.5 text-right text-muted-foreground">{formatCurrency(c.current)}</td>
                      <td className="py-0.5 text-center text-muted-foreground">→</td>
                      <td className="num py-0.5 text-right font-medium">{formatCurrency(c.proposed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {typeof payload.documentId === "string" && (
              <Link href={`/documents/${payload.documentId}`} className="text-xs text-primary hover:underline">
                Apri documento e dati estratti
              </Link>
            )}
            {a.status === "PENDING" ? (
              canDecide ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide(a.id, "APPROVE")} disabled={Boolean(busy)}>
                    {busy === a.id + "APPROVE" ? <Loader2 className="animate-spin" /> : <Check />} Approva
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(a.id, "REJECT")} disabled={Boolean(busy)}>
                    <X /> Rifiuta
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">In attesa di decisione da parte di un Advisor o Owner.</p>
              )
            ) : (
              <Pill tone={a.status === "APPROVED" ? "success" : "neutral"}>
                {a.status === "APPROVED" ? "Approvata" : "Rifiutata"} {a.decidedAt ? formatDateTime(a.decidedAt) : ""}
              </Pill>
            )}
          </li>
        );
      })}
    </ul>
  );
}
