import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { createStatement, getFinancialOverview } from "@/services/financials";

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getFinancialOverview(ctx, id));

/** Manual entry of a financial statement. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return createStatement(ctx, id, body);
});
