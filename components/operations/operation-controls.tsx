"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AIMeta, CreateTaskButton, GenerateButton, ItemList, SourcesList, useAIAction, type SourceRef } from "@/components/ai/ai-insight-parts";
import { Pill } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorText } from "@/lib/client/api";
import { OPERATION_STATUSES, OPERATION_STATUS_LABELS, type BasisKey } from "@/lib/labels";

export function OperationStatusSelect({ operationId, status, disabled }: { operationId: string; status: string; disabled?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  async function change(next: string) {
    const previous = value;
    setValue(next);
    try {
      await api(`/api/operations/${operationId}`, { method: "PATCH", body: { status: next } });
      toast.success(`Stato: ${OPERATION_STATUS_LABELS[next as keyof typeof OPERATION_STATUS_LABELS]}`);
      router.refresh();
    } catch (error) {
      setValue(previous);
      toast.error(errorText(error));
    }
  }
  return (
    <Select value={value} onValueChange={change} disabled={disabled}>
      <SelectTrigger size="sm" className="w-44" aria-label="Stato operazione" data-testid="operation-status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPERATION_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {OPERATION_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DeleteOperationButton({ operationId }: { operationId: string }) {
  const router = useRouter();
  async function remove() {
    if (!window.confirm("Eliminare l'operazione con checklist e collegamenti? I task restano ma senza operazione.")) return;
    try {
      await api(`/api/operations/${operationId}`, { method: "DELETE" });
      toast.success("Operazione eliminata");
      router.push("/operations");
    } catch (error) {
      toast.error(errorText(error));
    }
  }
  return (
    <Button size="icon-sm" variant="ghost" onClick={remove} aria-label="Elimina operazione">
      <Trash2 />
    </Button>
  );
}

interface OperationSummaryContent {
  summary: string;
  status_assessment: string;
  missing_documents: { name: string; reason: string; in_checklist: boolean }[];
  next_steps: string[];
  risks: { text: string; basis: BasisKey }[];
  model?: string;
  provider?: string;
}

export function OperationSummaryPanel({
  operationId,
  companyId,
  insight,
  aiConfigured,
}: {
  operationId: string;
  companyId: string;
  insight: { content: unknown; sourceRefs: unknown; createdAt: Date | string } | null;
  aiConfigured: boolean;
}) {
  const { pending, error, run } = useAIAction(`/api/operations/${operationId}/summary`, "Sintesi operazione generata");
  const content = insight?.content as OperationSummaryContent | undefined;

  return (
    <div className="space-y-3 p-4" data-testid="operation-summary">
      {aiConfigured && (
        <div className="flex justify-end">
          <GenerateButton pending={pending} onClick={run} hasResult={Boolean(content)} label="Genera sintesi" />
        </div>
      )}
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!content ? (
        <EmptyState
          icon={<Sparkles />}
          title={aiConfigured ? "Nessuna sintesi" : "AI non configurata"}
          description={aiConfigured ? "L'AI valuta avanzamento, documenti mancanti (anche fuori checklist), prossimi passi e rischi." : undefined}
        />
      ) : (
        <div className="space-y-3 text-[13px]">
          <p>{content.summary}</p>
          <p className="text-muted-foreground">{content.status_assessment}</p>
          {content.missing_documents.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documenti mancanti individuati</div>
              <ul className="space-y-1">
                {content.missing_documents.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Pill tone={d.in_checklist ? "warning" : "violet"}>{d.in_checklist ? "In checklist" : "Suggerito"}</Pill>
                    <span>
                      <span className="font-medium">{d.name}</span> — <span className="text-muted-foreground">{d.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prossimi passi</div>
            <ul className="space-y-1">
              {content.next_steps.map((s, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span>{s}</span>
                  <CreateTaskButton title={s} companyId={companyId} description="Prossimo passo suggerito dalla sintesi AI dell'operazione" />
                </li>
              ))}
            </ul>
          </div>
          {content.risks.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rischi</div>
              <ItemList items={content.risks.map((r) => ({ text: r.text, basis: r.basis }))} />
            </div>
          )}
          <SourcesList sources={(insight?.sourceRefs as SourceRef[]) ?? []} />
          <AIMeta model={content.model} provider={content.provider} createdAt={insight!.createdAt} />
        </div>
      )}
    </div>
  );
}
