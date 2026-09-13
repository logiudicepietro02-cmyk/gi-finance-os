import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { updateStatement, verifyStatement } from "@/services/financials";

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateStatement(ctx, id, body);
});

/** POST = mark as verified */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => verifyStatement(ctx, id));
