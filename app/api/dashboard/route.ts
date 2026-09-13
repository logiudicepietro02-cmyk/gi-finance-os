import { apiRoute, queryParams } from "@/lib/api/handler";
import { generateDailyBriefing } from "@/services/ai-analysis";
import { getDashboard } from "@/services/dashboard";

export const maxDuration = 300;

export const GET = apiRoute(async (_req, ctx) => getDashboard(ctx));

/** Generates (or returns today's) AI narrative briefing. ?force=1 regenerates. */
export const POST = apiRoute(async (req, ctx) => generateDailyBriefing(ctx, { force: queryParams(req).get("force") === "1" }));
