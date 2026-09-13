import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { deleteTask, updateTask } from "@/services/tasks";

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateTask(ctx, id, body);
});

export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => deleteTask(ctx, id));
