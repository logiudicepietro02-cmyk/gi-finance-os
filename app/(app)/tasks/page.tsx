import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { listOperations } from "@/services/operations";
import { TASK_VIEWS, getTaskCounts, listTasks, type TaskView } from "@/services/tasks";
import { listUsers } from "@/services/users";

export const metadata: Metadata = { title: "Task" };

const VIEWS: { key: TaskView; label: string; countKey?: "today" | "week" | "overdue" | "waiting" | "open" }[] = [
  { key: "today", label: "Oggi", countKey: "today" },
  { key: "week", label: "Prossimi 7 giorni", countKey: "week" },
  { key: "overdue", label: "Scaduti", countKey: "overdue" },
  { key: "waiting", label: "In attesa", countKey: "waiting" },
  { key: "open", label: "Tutti aperti", countKey: "open" },
  { key: "done", label: "Completati" },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; mine?: string; new?: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const sp = await searchParams;
  const view: TaskView = TASK_VIEWS.includes(sp.view as TaskView) ? (sp.view as TaskView) : "open";
  const mine = sp.mine === "1";
  const [tasks, counts, companies, operations, users] = await Promise.all([
    listTasks(ctx, { view, q: sp.q, assigneeId: mine ? user.id : undefined }),
    getTaskCounts(ctx),
    listCompanies(ctx),
    listOperations(ctx, { scope: "open" }),
    listUsers(ctx),
  ]);
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, q: sp.q, mine: mine ? "1" : undefined, ...patch })) if (v) p.set(k, v);
    return `/tasks?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Task"
        description="Attività operative dello studio"
        actions={
          <TaskFormDialog
            options={{
              companies: companies.map((c) => ({ id: c.id, name: c.name })),
              operations: operations.map((o) => ({ id: o.id, title: o.title, companyId: o.companyId })),
              users: users.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.name })),
            }}
            currentUserId={user.id}
            defaultOpen={sp.new === "1"}
          />
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1" aria-label="Viste task">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={link({ view: v.key })}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v.label}
              {v.countKey && (
                <span className={cn("num rounded px-1 text-[11px]", view === v.key ? "bg-white/20" : v.key === "overdue" && counts.overdue ? "bg-red-100 text-red-700" : "bg-muted")}>
                  {counts[v.countKey]}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <Link href={link({ mine: mine ? undefined : "1" })} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", mine ? "border-primary text-primary" : "text-muted-foreground")}>
          Solo i miei
        </Link>
        <form action="/tasks" className="relative ml-auto">
          <input type="hidden" name="view" value={view} />
          {mine && <input type="hidden" name="mine" value="1" />}
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q} placeholder="Cerca task" className="h-8 w-56 pl-8" />
        </form>
      </div>
      <Panel>
        <TaskList tasks={tasks} emptyTitle="Nessun task in questa vista" />
      </Panel>
    </>
  );
}
