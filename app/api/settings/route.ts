import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { getAIStatus } from "@/lib/ai";
import { getOrganizationSettings, updateOrganizationSettings } from "@/services/settings";

export const GET = apiRoute(async (_req, ctx) => ({ ...(await getOrganizationSettings(ctx)), ai: getAIStatus() }));

export const PUT = apiRoute(async (req, ctx) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateOrganizationSettings(ctx, body);
});
