import { apiRoute, queryParams } from "@/lib/api/handler";
import { int, str } from "@/lib/api/params";
import { listActivity } from "@/services/activity";

export const GET = apiRoute(async (req, ctx) => {
  const q = queryParams(req);
  return listActivity(ctx, {
    companyId: str(q.get("companyId")) ?? undefined,
    actorType: str(q.get("actorType")) ?? undefined,
    entityType: str(q.get("entityType")) ?? undefined,
    before: str(q.get("before")) ?? undefined,
    limit: int(q.get("limit")) ?? undefined,
  });
});
