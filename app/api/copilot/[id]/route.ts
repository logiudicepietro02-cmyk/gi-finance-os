import { apiRoute } from "@/lib/api/handler";
import { getConversation } from "@/services/copilot";

export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => getConversation(ctx, id));
