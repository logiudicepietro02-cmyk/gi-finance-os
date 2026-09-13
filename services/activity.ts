import { db, type Prisma } from "@/lib/db";
import { assertCompanyInOrg } from "./companies";
import { authorize, type ServiceContext } from "./context";

export async function listActivity(
  ctx: ServiceContext,
  filters: { companyId?: string; actorType?: string; entityType?: string; limit?: number; before?: string } = {},
) {
  if (filters.companyId) {
    authorize(ctx, "company:read");
    await assertCompanyInOrg(ctx, filters.companyId);
  } else {
    authorize(ctx, "audit:read");
  }
  const where: Prisma.AuditLogWhereInput = { organizationId: ctx.organizationId };
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.actorType && ["USER", "AI", "SYSTEM"].includes(filters.actorType)) {
    where.actorType = filters.actorType as Prisma.AuditLogWhereInput["actorType"];
  }
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.before) {
    const before = new Date(filters.before);
    if (!Number.isNaN(before.getTime())) where.createdAt = { lt: before };
  }
  const rows = await db.auditLog.findMany({
    where,
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 100, 500),
  });
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((id): id is string => Boolean(id)))];
  const companies = companyIds.length
    ? await db.company.findMany({ where: { id: { in: companyIds }, organizationId: ctx.organizationId }, select: { id: true, name: true } })
    : [];
  const names = new Map(companies.map((c) => [c.id, c.name]));
  return rows.map((r) => ({ ...r, companyName: r.companyId ? (names.get(r.companyId) ?? null) : null }));
}

export type ActivityItem = Awaited<ReturnType<typeof listActivity>>[number];

/** AI invocations log (agent/tool kind, provider, model, input, output, tokens, duration). */
export async function listAIRuns(ctx: ServiceContext, filters: { limit?: number } = {}) {
  authorize(ctx, "audit:read");
  const runs = await db.aIRun.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 50, 200),
  });
  const userIds = [...new Set(runs.map((r) => r.userId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return runs.map((r) => ({ ...r, userName: r.userId ? (names.get(r.userId) ?? null) : null }));
}
