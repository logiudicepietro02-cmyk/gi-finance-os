import { z } from "zod";
import { apiRoute, parseBody, queryParams } from "@/lib/api/handler";
import { str } from "@/lib/api/params";
import { createOperation, listOperations } from "@/services/operations";

export const GET = apiRoute(async (req, ctx) => {
  const q = queryParams(req);
  const scope = str(q.get("scope"));
  return listOperations(ctx, {
    companyId: str(q.get("companyId")) ?? undefined,
    status: str(q.get("status")) ?? undefined,
    q: str(q.get("q")) ?? undefined,
    scope: scope === "open" || scope === "closed" ? scope : "all",
  });
});

export const POST = apiRoute(async (req, ctx) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return createOperation(ctx, body);
});
