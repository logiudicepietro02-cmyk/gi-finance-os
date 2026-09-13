import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { deleteChecklistItem, updateChecklistItem } from "@/services/operations";

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateChecklistItem(ctx, id, body);
});

export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => deleteChecklistItem(ctx, id));
