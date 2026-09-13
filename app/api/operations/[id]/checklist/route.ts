import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { addChecklistItem } from "@/services/operations";

export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return addChecklistItem(ctx, id, body);
});
