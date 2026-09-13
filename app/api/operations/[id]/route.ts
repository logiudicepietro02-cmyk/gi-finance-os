import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { deleteOperation, getOperation, updateOperation } from "@/services/operations";

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getOperation(ctx, id));

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateOperation(ctx, id, body);
});

export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => deleteOperation(ctx, id));
