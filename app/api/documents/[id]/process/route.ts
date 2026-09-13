import { apiRoute } from "@/lib/api/handler";
import { processDocument } from "@/workers/document-processor";

export const maxDuration = 300;

export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => processDocument(ctx, id));
