import { audit, type ActorTypeKey } from "@/lib/audit";
import { addDays, startOfDay } from "@/lib/dates";
import { db, type Prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/permissions";
import { taskCreateSchema, taskUpdateSchema } from "@/lib/validation/schemas";
import { syncAlerts } from "./alerts";
import { authorize, type ServiceContext } from "./context";

export type TaskView = "today" | "week" | "overdue" | "waiting" | "open" | "done" | "all";
export const TASK_VIEWS: TaskView[] = ["today", "week", "overdue", "waiting", "open", "done", "all"];

export const taskInclude = {
  company: { select: { id: true, name: true } },
  operation: { select: { id: true, title: true } },
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

export function taskViewWhere(view: TaskView, now: Date = new Date()): Prisma.TaskWhereInput {
  const today = startOfDay(now);
  switch (view) {
    case "today":
      return { status: { not: "DONE" }, dueDate: { gte: today, lt: addDays(today, 1) } };
    case "week":
      return { status: { not: "DONE" }, dueDate: { gte: today, lt: addDays(today, 8) } };
    case "overdue":
      return { status: { not: "DONE" }, dueDate: { lt: today } };
    case "waiting":
      return { status: "WAITING" };
    case "open":
      return { status: { not: "DONE" } };
    case "done":
      return { status: "DONE" };
    default:
      return {};
  }
}

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export async function listTasks(
  ctx: ServiceContext,
  filters: { view?: TaskView; companyId?: string; operationId?: string; assigneeId?: string; q?: string; limit?: number } = {},
) {
  authorize(ctx, "task:read");
  const where: Prisma.TaskWhereInput = { organizationId: ctx.organizationId, ...taskViewWhere(filters.view ?? "open") };
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.operationId) where.operationId = filters.operationId;
  if (filters.assigneeId) where.assigneeId = filters.assigneeId;
  if (filters.q?.trim()) where.title = { contains: filters.q.trim(), mode: "insensitive" };
  const tasks = await db.task.findMany({
    where,
    include: taskInclude,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: filters.limit ?? 300,
  });
  return tasks.sort((a, b) => {
    const da = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dbt = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (startOfDay(new Date(Math.min(da, 8.64e15))).getTime() !== startOfDay(new Date(Math.min(dbt, 8.64e15))).getTime()) return da - dbt;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

export type TaskListItem = Awaited<ReturnType<typeof listTasks>>[number];

export async function getTaskCounts(ctx: ServiceContext) {
  authorize(ctx, "task:read");
  const base = { organizationId: ctx.organizationId };
  const [today, week, overdue, waiting, open] = await Promise.all(
    (["today", "week", "overdue", "waiting", "open"] as const).map((v) => db.task.count({ where: { ...base, ...taskViewWhere(v) } })),
  );
  return { today, week, overdue, waiting, open };
}

async function resolveTaskRefs(
  ctx: ServiceContext,
  refs: { companyId?: string | null; operationId?: string | null; financingDocumentId?: string | null; assigneeId?: string | null; alertId?: string | null },
) {
  const org = ctx.organizationId;
  let companyId = refs.companyId;
  if (refs.companyId) {
    const c = await db.company.findFirst({ where: { id: refs.companyId, organizationId: org }, select: { id: true } });
    if (!c) throw new NotFoundError("Azienda");
  }
  if (refs.operationId) {
    const op = await db.financingOperation.findFirst({ where: { id: refs.operationId, organizationId: org }, select: { companyId: true } });
    if (!op) throw new NotFoundError("Operazione");
    if (!companyId) companyId = op.companyId;
  }
  if (refs.financingDocumentId) {
    const item = await db.financingDocument.findFirst({ where: { id: refs.financingDocumentId, organizationId: org }, select: { id: true } });
    if (!item) throw new NotFoundError("Voce checklist");
  }
  if (refs.assigneeId) {
    const u = await db.user.findFirst({ where: { id: refs.assigneeId, organizationId: org }, select: { id: true } });
    if (!u) throw new NotFoundError("Utente");
  }
  if (refs.alertId) {
    const a = await db.alert.findFirst({ where: { id: refs.alertId, organizationId: org }, select: { id: true } });
    if (!a) throw new NotFoundError("Alert");
  }
  return { companyId };
}

export async function createTask(
  ctx: ServiceContext,
  input: unknown,
  opts: { source?: "MANUAL" | "AI" | "BRIEFING" | "ALERT" | "CHECKLIST"; aiRunId?: string | null; actorType?: ActorTypeKey } = {},
) {
  authorize(ctx, "task:write");
  const data = taskCreateSchema.parse(input);
  const { companyId } = await resolveTaskRefs(ctx, data);
  const source = opts.source ?? data.source;
  const task = await db.task.create({
    data: {
      organizationId: ctx.organizationId,
      title: data.title,
      description: data.description ?? null,
      companyId: companyId ?? null,
      operationId: data.operationId ?? null,
      financingDocumentId: data.financingDocumentId ?? null,
      assigneeId: data.assigneeId ?? null,
      alertId: data.alertId ?? null,
      priority: data.priority,
      status: data.status,
      dueDate: data.dueDate ?? null,
      createdById: ctx.userId,
      source,
      aiRunId: opts.aiRunId ?? null,
      completedAt: data.status === "DONE" ? new Date() : null,
    },
    include: taskInclude,
  });
  await audit(ctx, {
    action: "task.create",
    entityType: "Task",
    entityId: task.id,
    companyId: task.companyId,
    actorType: opts.actorType ?? "USER",
    aiRunId: opts.aiRunId ?? null,
    metadata: { title: task.title, priority: task.priority, dueDate: task.dueDate, source, operationId: task.operationId },
  });
  if (task.dueDate && task.dueDate < startOfDay()) await syncAlerts(ctx.organizationId);
  return task;
}

export async function updateTask(ctx: ServiceContext, taskId: string, input: unknown) {
  authorize(ctx, "task:write");
  const existing = await db.task.findFirst({ where: { id: taskId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Task");
  const data = taskUpdateSchema.parse(input);
  const { companyId } = await resolveTaskRefs(ctx, data);
  const statusChanged = data.status !== undefined && data.status !== existing.status;
  const task = await db.task.update({
    where: { id: taskId },
    data: {
      title: data.title,
      description: data.description,
      companyId: data.companyId === undefined && data.operationId === undefined ? undefined : (companyId ?? null),
      operationId: data.operationId,
      financingDocumentId: data.financingDocumentId,
      assigneeId: data.assigneeId,
      alertId: data.alertId,
      priority: data.priority,
      status: data.status,
      dueDate: data.dueDate,
      completedAt: statusChanged ? (data.status === "DONE" ? new Date() : null) : undefined,
    },
    include: taskInclude,
  });
  await audit(ctx, {
    action: statusChanged && data.status === "DONE" ? "task.complete" : "task.update",
    entityType: "Task",
    entityId: taskId,
    companyId: task.companyId,
    metadata: {
      title: task.title,
      fields: Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k),
      from: statusChanged ? existing.status : undefined,
      to: statusChanged ? data.status : undefined,
      operationId: task.operationId,
    },
  });
  if (statusChanged || data.dueDate !== undefined) await syncAlerts(ctx.organizationId);
  return task;
}

export async function deleteTask(ctx: ServiceContext, taskId: string) {
  authorize(ctx, "task:write");
  const existing = await db.task.findFirst({ where: { id: taskId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Task");
  await db.task.delete({ where: { id: taskId } });
  await audit(ctx, {
    action: "task.delete",
    entityType: "Task",
    entityId: taskId,
    companyId: existing.companyId,
    metadata: { title: existing.title, operationId: existing.operationId },
  });
  await syncAlerts(ctx.organizationId);
  return { ok: true };
}
