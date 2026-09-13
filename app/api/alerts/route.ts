import { apiRoute, queryParams } from "@/lib/api/handler";
import { str } from "@/lib/api/params";
import { authorize } from "@/services/context";
import { listAlerts, syncAlerts } from "@/services/alerts";

export const GET = apiRoute(async (req, ctx) => {
  const q = queryParams(req);
  return listAlerts(ctx, {
    companyId: str(q.get("companyId")) ?? undefined,
    scope: q.get("scope") === "all" ? "all" : "active",
  });
});

/** Re-run the deterministic alert rules now. */
export const POST = apiRoute(async (_req, ctx) => {
  authorize(ctx, "alert:manage");
  return syncAlerts(ctx.organizationId);
});
