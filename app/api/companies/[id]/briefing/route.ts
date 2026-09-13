import { apiRoute } from "@/lib/api/handler";
import { generateClientBriefing } from "@/services/ai-analysis";
import { getLatestInsight } from "@/services/insights";

export const maxDuration = 300;

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getLatestInsight(ctx, { kind: "CLIENT_BRIEFING", companyId: id }));

export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => generateClientBriefing(ctx, id));
