import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { badRequest, conflict } from "@/lib/errors";
import { NotFoundError } from "@/lib/permissions";
import { authorize, type ServiceContext } from "./context";
import { approveExtraction, rejectExtraction } from "./financials";
import { createTask } from "./tasks";

export async function listApprovals(ctx: ServiceContext, filters: { status?: "PENDING" | "APPROVED" | "REJECTED"; companyId?: string } = {}) {
  authorize(ctx, "company:read");
  return db.approvalRequest.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: filters.status ?? "PENDING",
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function decideApproval(ctx: ServiceContext, approvalId: string, decision: "APPROVE" | "REJECT", notes?: string | null) {
  authorize(ctx, "approval:decide");
  const approval = await db.approvalRequest.findFirst({ where: { id: approvalId, organizationId: ctx.organizationId } });
  if (!approval) throw new NotFoundError("Richiesta di approvazione");
  if (approval.status !== "PENDING") throw conflict("Richiesta già decisa.");

  if (approval.type === "UPDATE_FINANCIAL_STATEMENT") {
    if (!approval.documentExtractionId) throw badRequest("Richiesta senza estrazione collegata.");
    // Extraction review updates the linked approval request and writes the audit trail.
    if (decision === "APPROVE") await approveExtraction(ctx, approval.documentExtractionId, { notes });
    else await rejectExtraction(ctx, approval.documentExtractionId, { notes });
    return db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
  }

  let resultEntityId: string | null = null;
  if (decision === "APPROVE" && approval.type === "CREATE_TASK") {
    const task = await createTask(ctx, approval.payload, { source: "AI", aiRunId: approval.aiRunId, actorType: "USER" });
    resultEntityId = task.id;
  }
  const updated = await db.approvalRequest.update({
    where: { id: approvalId },
    data: {
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      decidedById: ctx.userId,
      decidedAt: new Date(),
      resultEntityId,
    },
  });
  await audit(ctx, {
    action: decision === "APPROVE" ? "approval.approve" : "approval.reject",
    entityType: "ApprovalRequest",
    entityId: approvalId,
    companyId: approval.companyId,
    aiRunId: approval.aiRunId,
    metadata: { type: approval.type, title: approval.title, resultEntityId, notes: notes ?? null },
  });
  return updated;
}
