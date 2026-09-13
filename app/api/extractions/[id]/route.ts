import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { approveExtraction, getExtraction, rejectExtraction } from "@/services/financials";

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getExtraction(ctx, id));

/** body: { decision: "APPROVE" | "REJECT", values?, fiscalYear?, notes? } */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.object({ decision: z.enum(["APPROVE", "REJECT"]) }).passthrough());
  const { decision, ...rest } = body;
  return decision === "APPROVE" ? approveExtraction(ctx, id, rest) : rejectExtraction(ctx, id, rest);
});
