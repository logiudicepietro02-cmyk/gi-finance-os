import { apiRoute } from "@/lib/api/handler";
import { generateOperationSummary } from "@/services/ai-analysis";
import { getLatestInsight } from "@/services/insights";

export const maxDuration = 300;

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getLatestInsight(ctx, { kind: "OPERATION_SUMMARY", operationId: id }));

export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => generateOperationSummary(ctx, id));
