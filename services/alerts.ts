import { evaluateAlertRules } from "@/lib/alerts/rules";
import { audit } from "@/lib/audit";
import { startOfDay } from "@/lib/dates";
import { db, toJson, type Prisma } from "@/lib/db";
import { statementToValues } from "@/lib/financial/fields";
import { NotFoundError } from "@/lib/permissions";
import { parseOrgSettings } from "@/lib/settings";
import { authorize, type ServiceContext } from "./context";

const SEVERITY_RANK = { INFO: 0, WARNING: 1, CRITICAL: 2 } as const;
const ACTIVE_STATUSES = ["OPEN", "ACKNOWLEDGED"] as const;

/**
 * Runs the deterministic rules and reconciles the Alert table:
 * creates new alerts, refreshes existing ones, reopens resolved ones whose condition is back,
 * and auto-resolves active alerts whose condition no longer holds.
 */
export async function syncAlerts(organizationId: string, now: Date = new Date()) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  if (!org) return { created: 0, updated: 0, resolved: 0, total: 0 };
  const settings = parseOrgSettings(org.settings);

  const [companies, operations, tasks] = await Promise.all([
    db.company.findMany({
      where: { organizationId, status: { not: "CLOSED" } },
      select: {
        id: true,
        name: true,
        statements: { where: { type: "ANNUAL" }, orderBy: { fiscalYear: "desc" }, take: 1 },
      },
    }),
    db.financingOperation.findMany({
      where: { organizationId, status: { not: "REJECTED" } },
      select: {
        id: true,
        companyId: true,
        title: true,
        bank: true,
        status: true,
        maturityDate: true,
        checklist: { select: { id: true, name: true, required: true, status: true, dueDate: true } },
      },
    }),
    db.task.findMany({
      where: { organizationId, status: { not: "DONE" }, dueDate: { lt: startOfDay(now) } },
      select: { id: true, companyId: true, title: true, status: true, priority: true, dueDate: true },
    }),
  ]);

  const candidates = evaluateAlertRules({
    now,
    settings,
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      latestStatement: c.statements[0]
        ? { id: c.statements[0].id, fiscalYear: c.statements[0].fiscalYear, values: statementToValues(c.statements[0]) }
        : null,
    })),
    operations,
    tasks,
  });

  const keys = candidates.map((c) => c.dedupeKey);
  const existing = await db.alert.findMany({
    where: { organizationId, OR: [{ dedupeKey: { in: keys } }, { status: { in: [...ACTIVE_STATUSES] } }] },
  });
  const byKey = new Map(existing.map((a) => [a.dedupeKey, a]));

  let created = 0;
  let updated = 0;
  for (const c of candidates) {
    const prev = byKey.get(c.dedupeKey);
    const fields = {
      type: c.type,
      severity: c.severity,
      companyId: c.companyId,
      title: c.title,
      message: c.message,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      data: toJson(c.data) as Prisma.InputJsonValue,
      lastDetectedAt: now,
    };
    if (!prev) {
      await db.alert.create({
        data: { ...fields, organizationId, dedupeKey: c.dedupeKey, status: "OPEN", firstDetectedAt: now },
      });
      created++;
      continue;
    }
    let status = prev.status;
    if (prev.status === "RESOLVED") status = "OPEN";
    if (prev.status === "DISMISSED" && SEVERITY_RANK[c.severity] > SEVERITY_RANK[prev.severity]) status = "OPEN";
    const changed =
      status !== prev.status || prev.severity !== c.severity || prev.message !== c.message || prev.title !== c.title;
    if (changed) {
      await db.alert.update({
        where: { id: prev.id },
        data: { ...fields, status, resolvedAt: status === "OPEN" ? null : prev.resolvedAt },
      });
      updated++;
    }
  }

  const candidateKeys = new Set(keys);
  const toResolve = existing.filter(
    (a) => (a.status === "OPEN" || a.status === "ACKNOWLEDGED") && !candidateKeys.has(a.dedupeKey),
  );
  if (toResolve.length > 0) {
    await db.alert.updateMany({
      where: { id: { in: toResolve.map((a) => a.id) } },
      data: { status: "RESOLVED", resolvedAt: now },
    });
  }
  await db.organization.update({ where: { id: organizationId }, data: { alertsRunAt: now } });
  return { created, updated, resolved: toResolve.length, total: candidates.length };
}

/** Re-runs the rules if the last run is older than maxAgeMs (time-based rules such as maturities/overdue). */
export async function maybeSyncAlerts(organizationId: string, maxAgeMs = 10 * 60 * 1000) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { alertsRunAt: true } });
  if (!org) return;
  if (!org.alertsRunAt || Date.now() - org.alertsRunAt.getTime() > maxAgeMs || startOfDay(org.alertsRunAt) < startOfDay()) {
    await syncAlerts(organizationId);
  }
}

export async function listAlerts(
  ctx: ServiceContext,
  filters: { companyId?: string; scope?: "active" | "all"; limit?: number } = {},
) {
  authorize(ctx, "company:read");
  const where: Prisma.AlertWhereInput = { organizationId: ctx.organizationId };
  if (filters.companyId) where.companyId = filters.companyId;
  if ((filters.scope ?? "active") === "active") where.status = { in: [...ACTIVE_STATUSES] };
  const alerts = await db.alert.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      insights: { where: { kind: "NEXT_BEST_ACTION", status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastDetectedAt: "desc" },
    take: filters.limit ?? 200,
  });
  return alerts.sort((a, b) => {
    const activeA = a.status === "OPEN" || a.status === "ACKNOWLEDGED" ? 1 : 0;
    const activeB = b.status === "OPEN" || b.status === "ACKNOWLEDGED" ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  });
}

export type AlertListItem = Awaited<ReturnType<typeof listAlerts>>[number];

export async function updateAlertStatus(ctx: ServiceContext, alertId: string, action: "acknowledge" | "dismiss" | "reopen") {
  authorize(ctx, "alert:manage");
  const alert = await db.alert.findFirst({ where: { id: alertId, organizationId: ctx.organizationId } });
  if (!alert) throw new NotFoundError("Alert");
  const data: Prisma.AlertUpdateInput =
    action === "acknowledge"
      ? { status: "ACKNOWLEDGED", acknowledgedById: ctx.userId, acknowledgedAt: new Date() }
      : action === "dismiss"
        ? { status: "DISMISSED" }
        : { status: "OPEN" };
  const updated = await db.alert.update({ where: { id: alertId }, data });
  await audit(ctx, {
    action: action === "dismiss" ? "alert.dismiss" : "alert.acknowledge",
    entityType: "Alert",
    entityId: alertId,
    companyId: alert.companyId,
    metadata: { type: alert.type, title: alert.title, action },
  });
  return updated;
}
