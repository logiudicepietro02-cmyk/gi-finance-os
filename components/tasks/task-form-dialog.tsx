"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorText } from "@/lib/client/api";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/labels";

export interface TaskFormOptions {
  companies: { id: string; name: string }[];
  operations: { id: string; title: string; companyId: string }[];
  users: { id: string; name: string }[];
}

export function TaskFormDialog({
  options,
  defaultCompanyId,
  defaultOperationId,
  currentUserId,
  defaultOpen = false,
  triggerLabel = "Nuovo task",
  size = "sm",
}: {
  options: TaskFormOptions;
  defaultCompanyId?: string;
  defaultOperationId?: string;
  currentUserId: string;
  defaultOpen?: boolean;
  triggerLabel?: string;
  size?: "sm" | "xs";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "none");
  const [operationId, setOperationId] = useState(defaultOperationId ?? "none");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("TODO");

  const operations = options.operations.filter((o) => companyId === "none" || o.companyId === companyId);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await api("/api/tasks", {
          body: {
            title: form.get("title"),
            description: form.get("description"),
            dueDate: form.get("dueDate"),
            companyId: companyId === "none" ? null : companyId,
            operationId: operationId === "none" ? null : operationId,
            assigneeId: assigneeId === "none" ? null : assigneeId,
            priority,
            status,
          },
        });
        toast.success("Task creato");
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(errorText(err));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={size === "xs" ? "outline" : "default"} data-testid="new-task">
          <Plus /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo task</DialogTitle>
          <DialogDescription>Trasforma una conclusione in un&apos;attività con responsabile e scadenza.</DialogDescription>
        </DialogHeader>
        <form id="task-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="task-title">Titolo *</Label>
            <Input id="task-title" name="title" required autoFocus />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="task-description">Descrizione</Label>
            <Textarea id="task-description" name="description" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Azienda</Label>
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v);
                setOperationId("none");
              }}
            >
              <SelectTrigger className="w-full" data-testid="task-company">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna</SelectItem>
                {options.companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Operazione</Label>
            <Select value={operationId} onValueChange={setOperationId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna</SelectItem>
                {operations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assegnatario</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnato</SelectItem>
                {options.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due">Scadenza</Label>
            <Input id="task-due" name="dueDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Priorità</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Stato</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button type="submit" form="task-form" disabled={pending} data-testid="submit-task">
            {pending && <Loader2 className="animate-spin" />} Crea task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
