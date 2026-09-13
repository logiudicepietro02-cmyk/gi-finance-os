import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { decideApproval } from "@/services/approvals";

export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.object({ decision: z.enum(["APPROVE", "REJECT"]), notes: z.string().max(2000).nullish() }));
  return decideApproval(ctx, id, body.decision, body.notes);
});
