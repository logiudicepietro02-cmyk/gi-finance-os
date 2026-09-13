import { addDays, relativeDayLabel, startOfDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";
import { OPEN_OPERATION_STATUSES, OPERATION_STATUS_LABELS } from "@/lib/labels";
import { maybeSyncAlerts } from "./alerts";
import { authorize, type ServiceContext } from "./context";
import { taskInclude } from "./tasks";

type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface AttentionItem {
  text: string;
  detail: string | null;
  severity: Severity;
  href: string;
}

export interface AttentionEntry {
  companyId: string;
  companyName: string;
  score: number;
  items: AttentionItem[];
}

const SEVERITY_POINTS: Record<Severity, number> = { CRITICAL: 5, WARNING: 3, INFO: 1 };
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 2, WARNING: 1, INFO: 0 };

export async function getDashboard(ctx: ServiceContext) {
  authorize(ctx, "company:read");
  await maybeSyncAlerts(ctx.organizationId);
  const org = ctx.organizationId;
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 8);

  const [
    taskToday,
    taskWeek,
    taskOverdue,
    taskWaiting,
    taskList,
    operations,
    pendingExtractions,
    documentsToProcess,
    alerts,
    variationWarnings,
    recentDocuments,
    dailyBriefing,
    pendingApprovals,
  ] = await Promise.all([
    db.task.count({ where: { organizationId: org, status: { not: "DONE" }, dueDate: { gte: today, lt: tomorrow } } }),
    db.task.count({ where: { organizationId: org, status: { not: "DONE" }, dueDate: { gte: today, lt: weekEnd } } }),
    db.task.count({ where: { organizationId: org, status: { not: "DONE" }, dueDate: { lt: today } } }),
    db.task.count({ where: { organizationId: org, status: "WAITING" } }),
    db.task.findMany({
      where: { organizationId: org, status: { not: "DONE" }, dueDate: { lt: weekEnd } },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }],
      take: 10,
    }),
    db.financingOperation.findMany({
      where: { organizationId: org, status: { in: OPEN_OPERATION_STATUSES } },
      include: { company: { select: { id: true, name: true } }, checklist: { select: { required: true, status: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.documentExtraction.findMany({
      where: { organizationId: org, status: "PENDING_REVIEW" },
      include: {
        document: { select: { id: true, fileName: true, type: true, createdAt: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.document.findMany({
      where: { organizationId: org, OR: [{ status: { in: ["UPLOADED", "FAILED"] } }, { companyId: null }] },
      select: { id: true, fileName: true, status: true, createdAt: true, company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.alert.findMany({
      where: { organizationId: org, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { lastDetectedAt: "desc" },
    }),
    db.insight.findMany({
      where: { organizationId: org, kind: "VARIATION", status: "ACTIVE", severity: "WARNING" },
      select: { companyId: true, title: true, company: { select: { name: true } } },
    }),
    db.document.findMany({
      where: { organizationId: org, createdAt: { gte: addDays(today, -3) }, companyId: { not: null } },
      select: { id: true, companyId: true, type: true, fiscalYear: true, createdAt: true, company: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.insight.findFirst({
      where: { organizationId: org, kind: "DAILY_BRIEFING", status: "ACTIVE", createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
    }),
    db.approvalRequest.count({ where: { organizationId: org, status: "PENDING" } }),
  ]);

  alerts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.lastDetectedAt.getTime() - a.lastDetectedAt.getTime());

  // ── Deterministic "needs attention" ranking ──
  const attention = new Map<string, AttentionEntry>();
  const push = (companyId: string | null, companyName: string | undefined, item: AttentionItem, points: number) => {
    if (!companyId || !companyName) return;
    const entry = attention.get(companyId) ?? { companyId, companyName, score: 0, items: [] };
    if (entry.items.some((i) => i.text === item.text)) return;
    entry.score += points;
    entry.items.push(item);
    attention.set(companyId, entry);
  };

  for (const a of alerts) {
    push(a.companyId, a.company?.name, { text: a.title, detail: a.message, severity: a.severity, href: `/companies/${a.companyId}` }, SEVERITY_POINTS[a.severity]);
  }
  for (const v of variationWarnings) {
    push(v.companyId, v.company?.name, { text: v.title, detail: "Variazione rispetto all'esercizio precedente", severity: "WARNING", href: `/companies/${v.companyId}?tab=analysis` }, 2);
  }
  for (const e of pendingExtractions) {
    const label = DOCUMENT_TYPE_LABELS[e.document.type];
    push(
      e.companyId,
      e.company?.name,
      {
        text: `${label}${e.fiscalYear ? ` ${e.fiscalYear}` : ""} caricato ${relativeDayLabel(e.document.createdAt, now)}: dati da verificare`,
        detail: e.document.fileName,
        severity: "WARNING",
        href: `/documents/${e.document.id}`,
      },
      2,
    );
  }
  for (const d of recentDocuments) {
    if (d.type !== "BILANCIO" && d.type !== "SITUAZIONE_CONTABILE") continue;
    push(
      d.companyId,
      d.company?.name,
      { text: `Ultimo ${DOCUMENT_TYPE_LABELS[d.type].toLowerCase()} caricato ${relativeDayLabel(d.createdAt, now)}`, detail: null, severity: "INFO", href: `/documents/${d.id}` },
      1,
    );
  }
  const opsByCompany = new Map<string, number>();
  for (const op of operations) {
    const n = (opsByCompany.get(op.companyId) ?? 0) + 1;
    opsByCompany.set(op.companyId, n);
    if (n > 2) continue;
    push(
      op.companyId,
      op.company.name,
      { text: `Operazione finanziaria in corso: ${op.title}`, detail: `${op.bank} · ${OPERATION_STATUS_LABELS[op.status]}`, severity: "INFO", href: `/operations/${op.id}` },
      1,
    );
  }

  const attentionList = [...attention.values()]
    .filter((e) => e.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((e) => ({ ...e, items: e.items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]).slice(0, 5) }));

  return {
    generatedAt: now,
    counts: {
      tasksToday: taskToday,
      tasksWeek: taskWeek,
      tasksOverdue: taskOverdue,
      tasksWaiting: taskWaiting,
      operationsInProgress: operations.length,
      documentsToReview: pendingExtractions.length + documentsToProcess.length,
      alertsOpen: alerts.length,
      alertsCritical: alerts.filter((a) => a.severity === "CRITICAL").length,
      companiesNeedingAttention: attentionList.length,
      pendingApprovals,
    },
    tasks: taskList,
    operations: operations.slice(0, 8).map((op) => {
      const required = op.checklist.filter((i) => i.required);
      const received = required.filter((i) => i.status === "RECEIVED" || i.status === "VERIFIED").length;
      return {
        id: op.id,
        title: op.title,
        bank: op.bank,
        status: op.status,
        company: op.company,
        maturityDate: op.maturityDate,
        probability: op.probability,
        checklist: { required: required.length, received },
      };
    }),
    documentsToReview: [
      ...pendingExtractions.map((e) => ({
        id: e.document.id,
        fileName: e.document.fileName,
        company: e.company,
        reason: "Dati estratti da verificare",
        createdAt: e.createdAt,
      })),
      ...documentsToProcess.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        company: d.company,
        reason: d.status === "FAILED" ? "Analisi fallita" : d.status === "UPLOADED" ? "Da analizzare" : "Azienda non associata",
        createdAt: d.createdAt,
      })),
    ].slice(0, 8),
    alerts: alerts.slice(0, 8),
    attention: attentionList,
    dailyBriefing,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
