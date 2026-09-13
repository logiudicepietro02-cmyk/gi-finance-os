import { apiRoute, queryParams } from "@/lib/api/handler";
import { str } from "@/lib/api/params";
import { listApprovals } from "@/services/approvals";

export const GET = apiRoute(async (req, ctx) => {
  const q = queryParams(req);
  const status = str(q.get("status"));
  return listApprovals(ctx, {
    status: status === "APPROVED" || status === "REJECTED" ? status : "PENDING",
    companyId: str(q.get("companyId")) ?? undefined,
  });
});
