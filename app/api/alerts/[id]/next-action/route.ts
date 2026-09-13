import { apiRoute } from "@/lib/api/handler";
import { generateNextBestAction } from "@/services/ai-analysis";

export const maxDuration = 300;

export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => generateNextBestAction(ctx, id));
