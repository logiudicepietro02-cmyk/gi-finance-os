import { apiRoute, parseBody, queryParams } from "@/lib/api/handler";
import { str } from "@/lib/api/params";
import { z } from "zod";
import { createCompany, listCompanies } from "@/services/companies";

export const GET = apiRoute(async (req, ctx) => {
  const q = queryParams(req);
  return listCompanies(ctx, { q: str(q.get("q")) ?? undefined, status: str(q.get("status")) ?? undefined });
});

export const POST = apiRoute(async (req, ctx) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return createCompany(ctx, body);
});
