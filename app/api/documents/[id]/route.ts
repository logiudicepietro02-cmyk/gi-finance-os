import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { deleteDocument, getDocument, updateDocument } from "@/services/documents";

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getDocument(ctx, id));

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateDocument(ctx, id, body);
});

export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => deleteDocument(ctx, id));
