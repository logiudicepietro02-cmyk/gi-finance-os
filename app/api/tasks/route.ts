import { z } from "zod";
import { apiRoute, parseBody, queryParams } from "@/lib/api/handler";
import { str } from "@/lib/api/params";
import { TASK_VIEWS, createTask, listTasks, type TaskView } from "@/services/tasks";

export const GET = apiRoute(async (req, ctx) => {
  const q = queryParams(req);
  const view = str(q.get("view"));
  return listTasks(ctx, {
    view: view && TASK_VIEWS.includes(view as TaskView) ? (view as TaskView) : "open",
    companyId: str(q.get("companyId")) ?? undefined,
    operationId: str(q.get("operationId")) ?? undefined,
    assigneeId: str(q.get("assigneeId")) ?? undefined,
    q: str(q.get("q")) ?? undefined,
  });
});

export const POST = apiRoute(async (req, ctx) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return createTask(ctx, body);
});
