import { db, toJson, type InsightKind, type Prisma } from "@/lib/db";
import { statementToValues } from "@/lib/financial/fields";
import { computeVariations, significantChanges } from "@/lib/financial/variations";
import { NotFoundError } from "@/lib/permissions";
import { authorize, type ServiceContext } from "./context";

export interface SourceRef {
  id: string;
  type: string;
  entityId: string | null;
  label: string;
  href?: string | null;
}

/** Deterministic YoY variation insights for a company (replaces previous RULES variations). */
export async function refreshVariationInsights(organizationId: string, companyId: string): Promise<number> {
  const statements = await db.financialStatement.findMany({
    where: { organizationId, companyId, type: "ANNUAL" },
    orderBy: { fiscalYear: "desc" },
    take: 2,
  });
  await db.insight.deleteMany({ where: { organizationId, companyId, kind: "VARIATION", source: "RULES" } });
  if (statements.length < 2) return 0;
  const [current, previous] = statements;
  const changes = significantChanges(computeVariations(statementToValues(current), statementToValues(previous)));
  if (changes.length === 0) return 0;
  await db.insight.createMany({
    data: changes.map((c) => ({
      organizationId,
      companyId,
      kind: "VARIATION" as const,
      source: "RULES" as const,
      severity: c.severity,
      title: c.message,
      summary: `${previous.fiscalYear} → ${current.fiscalYear}`,
      content: toJson({ key: c.key, favorable: c.favorable, variation: c.variation, years: [previous.fiscalYear, current.fiscalYear] }) as Prisma.InputJsonValue,
      sourceRefs: toJson([
        { id: "S1", type: "FinancialStatement", entityId: current.id, label: `Bilancio ${current.fiscalYear}` },
        { id: "S2", type: "FinancialStatement", entityId: previous.id, label: `Bilancio ${previous.fiscalYear}` },
      ]) as Prisma.InputJsonValue,
    })),
  });
  return changes.length;
}

export async function listInsights(
  ctx: ServiceContext,
  filters: { companyId?: string; operationId?: string; alertId?: string; kinds?: InsightKind[]; limit?: number } = {},
) {
  authorize(ctx, "company:read");
  const where: Prisma.InsightWhereInput = { organizationId: ctx.organizationId, status: "ACTIVE" };
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.operationId) where.operationId = filters.operationId;
  if (filters.alertId) where.alertId = filters.alertId;
  if (filters.kinds?.length) where.kind = { in: filters.kinds };
  return db.insight.findMany({ where, orderBy: { createdAt: "desc" }, take: filters.limit ?? 50 });
}

export async function getLatestInsight(
  ctx: ServiceContext,
  filters: { kind: InsightKind; companyId?: string | null; operationId?: string | null; alertId?: string | null },
) {
  authorize(ctx, "company:read");
  return db.insight.findFirst({
    where: {
      organizationId: ctx.organizationId,
      status: "ACTIVE",
      kind: filters.kind,
      ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
      ...(filters.operationId !== undefined ? { operationId: filters.operationId } : {}),
      ...(filters.alertId !== undefined ? { alertId: filters.alertId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function dismissInsight(ctx: ServiceContext, insightId: string) {
  authorize(ctx, "alert:manage");
  const insight = await db.insight.findFirst({ where: { id: insightId, organizationId: ctx.organizationId } });
  if (!insight) throw new NotFoundError("Insight");
  return db.insight.update({ where: { id: insightId }, data: { status: "DISMISSED" } });
}
