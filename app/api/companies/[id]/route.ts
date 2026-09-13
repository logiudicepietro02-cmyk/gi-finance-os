import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { deleteCompany, getCompany, updateCompany } from "@/services/companies";

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getCompany(ctx, id));

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateCompany(ctx, id, body);
});

export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => deleteCompany(ctx, id));
