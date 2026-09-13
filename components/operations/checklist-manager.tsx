"use client";

import { FileText, ListPlus, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/app/badges";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorText } from "@/lib/client/api";
import { daysUntil, toIsoDate } from "@/lib/dates";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentTypeKey } from "@/lib/documents/types";
import { CHECKLIST_STATUSES, CHECKLIST_STATUS_LABELS, type ChecklistStatusKey } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface ChecklistItemView {
  id: string;
  name: string;
  documentType: DocumentTypeKey;
  required: boolean;
  status: ChecklistStatusKey;
  dueDate: Date | string | null;
  document: { id: string; fileName: string } | null;
  tasks: { id: string; title: string }[];
}

const STATUS_TONE: Record<ChecklistStatusKey, string> = {
  MISSING: "text-red-700",
  REQUESTED: "text-amber-700",
  RECEIVED: "text-emerald-700",
  VERIFIED: "text-primary",
};

export function ChecklistManager({
  operationId,
  companyId,
  companyName,
  items,
  companyDocuments,
  canManage,
  canUpdate,
}: {
  operationId: string;
  companyId: string;
  companyName: string;
  items: ChecklistItemView[];
  companyDocuments: { id: string; fileName: string; type: DocumentTypeKey; fiscalYear: number | null }[];
  canManage: boolean;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DocumentTypeKey>("ALTRO");
  const [newRequired, setNewRequired] = useState(true);
  const [newDue, setNewDue] = useState("");
  const [pending, startTransition] = useTransition();

  async function patch(item: ChecklistItemView, body: Record<string, unknown>, message: string) {
    setBusy(item.id);
    try {
      await api(`/api/checklist/${item.id}`, { method: "PATCH", body });
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function assignTask(item: ChecklistItemView) {
    setBusy(item.id);
    try {
      await api(`/api/checklist/${item.id}/task`, { body: { dueDate: item.dueDate ? toIsoDate(new Date(item.dueDate)) : null } });
      toast.success("Task di richiesta creato e documento segnato come richiesto");
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: ChecklistItemView) {
    if (!window.confirm(`Rimuovere "${item.name}" dalla checklist?`)) return;
    setBusy(item.id);
    try {
      await api(`/api/checklist/${item.id}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  function addItem(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await api(`/api/operations/${operationId}/checklist`, { body: { name: newName, documentType: newType, required: newRequired, dueDate: newDue || null } });
        toast.success("Richiesta documento creata");
        setNewName("");
        setNewDue("");
        setAdding(false);
        router.refresh();
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  const required = items.filter((i) => i.required);
  const received = required.filter((i) => i.status === "RECEIVED" || i.status === "VERIFIED").length;

  return (
    <div data-testid="checklist">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${required.length ? (received / required.length) * 100 : 0}%` }} />
          </div>
          <span className="num text-muted-foreground">
            {received}/{required.length} documenti obbligatori
          </span>
        </div>
        {canManage && (
          <Button size="xs" variant="outline" onClick={() => setAdding((a) => !a)}>
            <Plus /> Crea richiesta
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={addItem} className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Documento richiesto" className="h-8 min-w-48 flex-1" required />
          <Select value={newType} onValueChange={(v) => setNewType(v as DocumentTypeKey)}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="h-8 w-40" aria-label="Scadenza" />
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={newRequired} onCheckedChange={(v) => setNewRequired(Boolean(v))} /> Obbligatorio
          </label>
          <Button size="sm" type="submit" disabled={pending || newName.trim().length < 2}>
            {pending && <Loader2 className="animate-spin" />} Aggiungi
          </Button>
        </form>
      )}

      <ul className="divide-y">
        {items.map((item) => {
          const due = item.dueDate ? new Date(item.dueDate) : null;
          const overdue = due && (item.status === "MISSING" || item.status === "REQUESTED") && daysUntil(new Date(), due) < 0;
          const candidates = companyDocuments.filter((d) => item.documentType === "ALTRO" || d.type === item.documentType);
          return (
            <li key={item.id} className={cn("group grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_150px_140px_auto]", busy === item.id && "opacity-60")}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  {item.name}
                  {item.required ? <Pill tone="neutral">Obbligatorio</Pill> : <Pill tone="neutral">Facoltativo</Pill>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>{DOCUMENT_TYPE_LABELS[item.documentType]}</span>
                  {item.document ? (
                    <Link href={`/documents/${item.document.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <FileText className="size-3" /> {item.document.fileName}
                    </Link>
                  ) : (
                    canUpdate &&
                    candidates.length > 0 && (
                      <Select onValueChange={(documentId) => patch(item, { documentId }, "Documento collegato")}>
                        <SelectTrigger size="sm" className="h-6 w-auto gap-1 border-dashed px-1.5 text-[11px]">
                          <SelectValue placeholder="Collega documento esistente" />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.fileName}
                              {d.fiscalYear ? ` (${d.fiscalYear})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  )}
                  {item.tasks.length > 0 && <span>· task: {item.tasks[0].title}</span>}
                </div>
              </div>
              <Select value={item.status} onValueChange={(status) => patch(item, { status }, "Stato aggiornato")} disabled={!canUpdate}>
                <SelectTrigger size="sm" className={cn("h-8 w-full text-xs font-medium", STATUS_TONE[item.status])} aria-label={`Stato ${item.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHECKLIST_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CHECKLIST_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                defaultValue={due ? toIsoDate(due) ?? "" : ""}
                onBlur={(e) => {
                  const next = e.target.value || null;
                  const current = due ? toIsoDate(due) : null;
                  if (next !== current) void patch(item, { dueDate: next }, "Scadenza aggiornata");
                }}
                disabled={!canUpdate}
                className={cn("h-8 text-xs", overdue && "border-red-300 text-red-700")}
                aria-label={`Scadenza ${item.name}`}
              />
              <div className="flex items-center justify-end gap-1">
                {(item.status === "MISSING" || item.status === "REQUESTED") && (
                  <>
                    {canUpdate && (
                      <UploadDialog companies={[{ id: companyId, name: companyName }]} defaultCompanyId={companyId} checklistItemId={item.id} defaultType={item.documentType} triggerLabel="Carica" triggerVariant="outline" triggerSize="xs" />
                    )}
                    {item.tasks.length === 0 && (
                      <Button size="xs" variant="ghost" onClick={() => assignTask(item)} disabled={busy === item.id} title="Crea un task per richiedere il documento">
                        <ListPlus /> Task
                      </Button>
                    )}
                  </>
                )}
                {canManage && (
                  <Button size="icon-xs" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => remove(item)} aria-label="Rimuovi">
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nessun documento in checklist.</li>}
      </ul>
    </div>
  );
}
