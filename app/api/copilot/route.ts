import { z } from "zod";
import { apiRoute, parseBody, queryParams } from "@/lib/api/handler";
import { str } from "@/lib/api/params";
import { askCopilot, listConversations } from "@/services/copilot";

export const maxDuration = 300;

export const GET = apiRoute(async (req, ctx) => listConversations(ctx, { companyId: str(queryParams(req).get("companyId")) ?? undefined }));

export const POST = apiRoute(async (req, ctx) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return askCopilot(ctx, body);
});
