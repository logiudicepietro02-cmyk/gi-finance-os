import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { updateAlertStatus } from "@/services/alerts";

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { action } = await parseBody(req, z.object({ action: z.enum(["acknowledge", "dismiss", "reopen"]) }));
  return updateAlertStatus(ctx, id, action);
});
