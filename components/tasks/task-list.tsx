"use client";

import { Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Pill, PriorityBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorText } from "@/lib/client/api";
import { daysUntil } from "@/lib/dates";
import { formatDate } from "@/lib/financial/format";
import { TASK_SOURCE_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, type TaskPriorityKey, type TaskStatusKey } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatusKey;
  priority: TaskPriorityKey;
  dueDate: Date | string | null;
  source: keyof typeof TASK_SOURCE_LABELS;
  company: { id: string; name: string } | null;
  operation: { id: string; title: string } | null;
  assignee: { id: string; name: string } | null;
}

function DueLabel({ dueDate, done }: { dueDate: Date | string | null; done: boolean }) {
  if (!dueDate) return <span className="text-muted-foreground">—</span>;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const days = daysUntil(new Date(), d);
  const label = days === 0 ? "Oggi" : days === 1 ? "Domani" : days === -1 ? "Ieri" : formatDate(d);
  return <span className={cn("num whitespace-nowrap", !done && days < 0 && "font-medium text-red-600", !done && days === 0 && "font-medium text-amber-700")}>{label}</span>;
}

export function TaskList({
  tasks,
  compact = false,
  showCompany = true,
  emptyTitle = "Nessun task",
}: {
  tasks: TaskItem[];
  compact?: boolean;
  showCompany?: boolean;
  emptyTitle?: string;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, TaskStatusKey>>({});

  async function setStatus(task: TaskItem, status: TaskStatusKey) {
    setOverrides((o) => ({ ...o, [task.id]: status }));
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { status } });
      if (status === "DONE") toast.success("Task completato");
      router.refresh();
    } catch (error) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[task.id];
        return next;
      });
      toast.error(errorText(error));
    }
  }

  async function remove(task: TaskItem) {
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      toast.success("Task eliminato");
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  if (tasks.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <ul className="divide-y" data-testid="task-list">
      {tasks.map((task) => {
        const status = overrides[task.id] ?? task.status;
        const done = status === "DONE";
        return (
          <li key={task.id} className={cn("group flex items-start gap-3 px-4", compact ? "py-2.5" : "py-3")}>
            <Checkbox
              checked={done}
              onCheckedChange={(checked) => setStatus(task, checked ? "DONE" : "TODO")}
              aria-label={`Completa ${task.title}`}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className={cn("text-[13px] font-medium leading-snug", done && "text-muted-foreground line-through")}>{task.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {showCompany && task.company && (
                  <Link href={`/companies/${task.company.id}`} className="hover:text-foreground hover:underline">
                    {task.company.name}
                  </Link>
                )}
                {task.operation && (
                  <Link href={`/operations/${task.operation.id}`} className="truncate hover:text-foreground hover:underline">
                    {task.operation.title}
                  </Link>
                )}
                {!compact && task.assignee && <span>· {task.assignee.name}</span>}
                {task.source !== "MANUAL" && (
                  <span className="inline-flex items-center gap-0.5">
                    {task.source === "AI" && <Sparkles className="size-3 text-violet-600" />}
                    {TASK_SOURCE_LABELS[task.source]}
                  </span>
                )}
              </div>
              {!compact && task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <PriorityBadge priority={task.priority} />
              <DueLabel dueDate={task.dueDate} done={done} />
              {!compact && (
                <>
                  <Select value={status} onValueChange={(v) => setStatus(task, v as TaskStatusKey)}>
                    <SelectTrigger size="sm" className="h-7 w-[120px] text-xs" aria-label="Stato task">
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
                  <Button size="icon-xs" variant="ghost" className="opacity-0 group-hover:opacity-100" aria-label="Elimina task" onClick={() => remove(task)}>
                    <Trash2 />
                  </Button>
                </>
              )}
              {compact && status === "WAITING" && <Pill tone="violet">In attesa</Pill>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
