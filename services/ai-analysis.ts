import { z } from "zod";
import { requireAIProvider } from "@/lib/ai";
import {
  ANALYSIS_SYSTEM_PROMPT,
  briefingPrompt,
  dailyBriefingPrompt,
  interpretationPrompt,
  nextBestActionPrompt,
  operationSummaryPrompt,
} from "@/lib/ai/prompts";
import { runAI } from "@/lib/ai/runs";
import { audit } from "@/lib/audit";
import { startOfDay, toIsoDate } from "@/lib/dates";
import { db, toJson, type Prisma } from "@/lib/db";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";
import { badRequest } from "@/lib/errors";
import { FIELD_LABELS, STATEMENT_FIELDS } from "@/lib/financial/fields";
import { formatCurrency, formatDate, formatRatio } from "@/lib/financial/format";
import { ALERT_SEVERITY_LABELS, CHECKLIST_STATUS_LABELS, OPERATION_STATUS_LABELS, OPERATION_TYPE_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { NotFoundError } from "@/lib/permissions";
import { listAlerts } from "./alerts";
import { getCompany } from "./companies";
import { authorize, type ServiceContext } from "./context";
import { getDashboard } from "./dashboard";
import { listDocuments } from "./documents";
import { getFinancialOverview } from "./financials";
import type { SourceRef } from "./insights";
import { getOperation, listOperations } from "./operations";
import { listTasks } from "./tasks";

// ─── Output schemas ───────────────────────────────────────
const basis = z.enum(["DATO", "CALCOLO", "INTERPRETAZIONE", "IPOTESI"]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const interpretationItem = z.strictObject({ text: z.string(), basis, references: z.array(z.string()) });
const sourcedItem = z.strictObject({ text: z.string(), basis, source_ids: z.array(z.string()) });

export const interpretationSchema = z.strictObject({
  situazione: z.string(),
  positivita: z.array(interpretationItem),
  criticita: z.array(interpretationItem),
  variazioni_rilevanti: z.array(interpretationItem),
  possibili_rischi: z.array(interpretationItem),
  possibili_azioni: z.array(interpretationItem),
});
export type FinancialInterpretation = z.infer<typeof interpretationSchema>;

export const briefingSchema = z.strictObject({
  executive_summary: z.string(),
  financial_position: z.string(),
  key_changes: z.array(sourcedItem),
  risks: z.array(sourcedItem),
  open_operations: z.array(sourcedItem),
  missing_information: z.array(sourcedItem),
  recommended_questions: z.array(z.string()),
  next_actions: z.array(z.strictObject({ title: z.string(), reason: z.string(), priority, source_ids: z.array(z.string()) })),
});
export type ClientBriefing = z.infer<typeof briefingSchema>;

export const nextBestActionSchema = z.strictObject({
  recommended_action: z.string(),
  reason: z.string(),
  priority,
  confidence: z.number().min(0).max(1),
  basis,
});
export type NextBestAction = z.infer<typeof nextBestActionSchema>;

export const operationSummarySchema = z.strictObject({
  summary: z.string(),
  status_assessment: z.string(),
  missing_documents: z.array(z.strictObject({ name: z.string(), reason: z.string(), in_checklist: z.boolean() })),
  next_steps: z.array(z.string()),
  risks: z.array(z.strictObject({ text: z.string(), basis })),
});
export type OperationSummary = z.infer<typeof operationSummarySchema>;

export const dailyBriefingSchema = z.strictObject({
  headline: z.string(),
  items: z.array(z.strictObject({ company: z.string(), summary: z.string(), priority })),
  focus_of_the_day: z.string(),
});
export type DailyBriefing = z.infer<typeof dailyBriefingSchema>;

// ─── Context builders ─────────────────────────────────────
class SourceRegistry {
  readonly items: SourceRef[] = [];
  add(type: string, entityId: string | null, label: string, href: string | null = null): string {
    const id = `S${this.items.length + 1}`;
    this.items.push({ id, type, entityId, label, href });
    return id;
  }
}

async function buildCompanyContext(ctx: ServiceContext, companyId: string) {
  const [company, overview, operations, tasks, alerts, documents] = await Promise.all([
    getCompany(ctx, companyId),
    getFinancialOverview(ctx, companyId),
    listOperations(ctx, { companyId, scope: "all" }),
    listTasks(ctx, { companyId, view: "open" }),
    listAlerts(ctx, { companyId }),
    listDocuments(ctx, { companyId, limit: 15 }),
  ]);
  const sources = new SourceRegistry();
  const today = new Date();

  const context = {
    data_odierna: formatDate(today),
    azienda: {
      source: sources.add("Company", company.id, `Anagrafica ${company.name}`, `/companies/${company.id}`),
      nome: company.name,
      forma_giuridica: company.legalForm,
      settore: company.sector,
      codice_ateco: company.atecoCode,
      sede: [company.city, company.province].filter(Boolean).join(" "),
      dipendenti: company.employees,
      stato_cliente: company.status,
      note: company.description,
    },
    bilanci: overview.statements.map((s) => ({
      source: sources.add(
        "FinancialStatement",
        s.id,
        `Bilancio ${s.fiscalYear} (${s.status === "VERIFIED" ? "verificato" : "da verificare"})${s.sourceDocument ? ` — ${s.sourceDocument.fileName}` : ""}`,
        `/companies/${company.id}?tab=analysis`,
      ),
      esercizio: s.fiscalYear,
      stato: s.status === "VERIFIED" ? "verificato" : "da verificare",
      valori: Object.fromEntries(
        STATEMENT_FIELDS.filter((f) => s.values[f] !== null && s.values[f] !== undefined).map((f) => [FIELD_LABELS[f], formatCurrency(s.values[f])]),
      ),
      indicatori: s.ratios.map((r) => ({ nome: r.label, valore_formattato: formatRatio(r), stato: r.status, formula: r.formula, nota: r.note })),
    })),
    variazioni_significative: overview.changes.map((c) => ({ testo: c.message, favorevole: c.favorable })),
    operazioni: operations.map((o) => ({
      source: sources.add("FinancingOperation", o.id, `Operazione: ${o.title} (${o.bank})`, `/operations/${o.id}`),
      titolo: o.title,
      banca: o.bank,
      tipo: OPERATION_TYPE_LABELS[o.type],
      stato: OPERATION_STATUS_LABELS[o.status],
      importo: formatCurrency(o.amount),
      debito_residuo: formatCurrency(o.outstandingDebt),
      tasso_percentuale: o.rate,
      scadenza: o.maturityDate ? formatDate(o.maturityDate) : null,
      probabilita: o.probability,
      documenti_obbligatori_mancanti: o.checklistSummary.missing,
    })),
    task_aperti: tasks.slice(0, 25).map((t) => ({
      source: sources.add("Task", t.id, `Task: ${t.title}`, "/tasks"),
      titolo: t.title,
      priorita: TASK_PRIORITY_LABELS[t.priority],
      stato: TASK_STATUS_LABELS[t.status],
      scadenza: t.dueDate ? formatDate(t.dueDate) : null,
      scaduto: !!t.dueDate && t.dueDate < startOfDay(today),
    })),
    alert_attivi: alerts.map((a) => ({
      source: sources.add("Alert", a.id, `Alert: ${a.title}`, `/companies/${company.id}`),
      severita: ALERT_SEVERITY_LABELS[a.severity],
      titolo: a.title,
      messaggio: a.message,
    })),
    documenti_recenti: documents.map((d) => ({
      source: sources.add("Document", d.id, d.fileName, `/documents/${d.id}`),
      nome_file: d.fileName,
      tipo: DOCUMENT_TYPE_LABELS[d.type],
      esercizio: d.fiscalYear,
      caricato_il: formatDate(d.createdAt),
      revisione_dati: d.extractions[0]?.status ?? null,
    })),
  };
  return { company, overview, context, sources: sources.items };
}

async function saveInsight(
  ctx: ServiceContext,
  data: {
    kind: "FINANCIAL_INTERPRETATION" | "CLIENT_BRIEFING" | "NEXT_BEST_ACTION" | "OPERATION_SUMMARY" | "DAILY_BRIEFING";
    title: string;
    summary: string | null;
    content: unknown;
    sourceRefs: SourceRef[];
    aiRunId: string;
    companyId?: string | null;
    operationId?: string | null;
    alertId?: string | null;
    severity?: "INFO" | "WARNING" | "CRITICAL" | null;
  },
) {
  return db.insight.create({
    data: {
      organizationId: ctx.organizationId,
      companyId: data.companyId ?? null,
      operationId: data.operationId ?? null,
      alertId: data.alertId ?? null,
      kind: data.kind,
      source: "AI",
      severity: data.severity ?? null,
      title: data.title,
      summary: data.summary,
      content: toJson(data.content) as Prisma.InputJsonValue,
      sourceRefs: toJson(data.sourceRefs) as Prisma.InputJsonValue,
      aiRunId: data.aiRunId,
      createdById: ctx.userId,
    },
  });
}

// ─── Use cases ────────────────────────────────────────────
export async function generateFinancialInterpretation(ctx: ServiceContext, companyId: string) {
  authorize(ctx, "ai:use");
  const provider = requireAIProvider();
  const { company, overview, context, sources } = await buildCompanyContext(ctx, companyId);
  if (overview.statements.length === 0) throw badRequest("Nessun bilancio disponibile: carica un bilancio prima di generare l'interpretazione.");
  const { bilanci, variazioni_significative, alert_attivi, azienda, data_odierna } = context;
  const promptContext = { data_odierna, azienda, bilanci, variazioni_significative, alert_attivi };

  const { result, runId } = await runAI(ctx, { kind: "FINANCIAL_INTERPRETATION", companyId, input: promptContext }, provider, async () => {
    const r = await provider.generateObject({
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: interpretationPrompt(promptContext),
      schema: interpretationSchema,
      schemaName: "financial_interpretation",
      effort: "high",
    });
    return { result: r.object, output: r.object, usage: r.usage };
  });
  const usedSources = sources.filter((s) => s.type === "FinancialStatement" || s.type === "Alert" || s.type === "Company");
  const insight = await saveInsight(ctx, {
    kind: "FINANCIAL_INTERPRETATION",
    title: `Interpretazione finanziaria ${company.name}`,
    summary: result.situazione,
    content: { ...result, model: provider.model, provider: provider.name, statementYears: overview.statements.map((s) => s.fiscalYear) },
    sourceRefs: usedSources,
    aiRunId: runId,
    companyId,
  });
  await audit(ctx, { action: "ai.interpretation", entityType: "Insight", entityId: insight.id, companyId, aiRunId: runId, metadata: { model: provider.model } });
  return insight;
}

export async function generateClientBriefing(ctx: ServiceContext, companyId: string) {
  authorize(ctx, "ai:use");
  const provider = requireAIProvider();
  const { company, context, sources } = await buildCompanyContext(ctx, companyId);
  const { result, runId } = await runAI(ctx, { kind: "CLIENT_BRIEFING", companyId, input: context }, provider, async () => {
    const r = await provider.generateObject({
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: briefingPrompt(context),
      schema: briefingSchema,
      schemaName: "client_briefing",
      effort: "high",
    });
    return { result: r.object, output: r.object, usage: r.usage };
  });
  const insight = await saveInsight(ctx, {
    kind: "CLIENT_BRIEFING",
    title: `Briefing incontro — ${company.name}`,
    summary: result.executive_summary,
    content: { ...result, model: provider.model, provider: provider.name },
    sourceRefs: sources,
    aiRunId: runId,
    companyId,
  });
  await audit(ctx, { action: "ai.briefing", entityType: "Insight", entityId: insight.id, companyId, aiRunId: runId, metadata: { model: provider.model, sources: sources.length } });
  return insight;
}

export async function generateNextBestAction(ctx: ServiceContext, alertId: string) {
  authorize(ctx, "ai:use");
  const provider = requireAIProvider();
  const alert = await db.alert.findFirst({ where: { id: alertId, organizationId: ctx.organizationId }, include: { company: { select: { id: true, name: true } } } });
  if (!alert) throw new NotFoundError("Alert");

  const sources = new SourceRegistry();
  let companyContext: unknown = null;
  if (alert.companyId) {
    const built = await buildCompanyContext(ctx, alert.companyId);
    companyContext = {
      azienda: built.context.azienda,
      ultimo_bilancio: built.context.bilanci.at(-1) ?? null,
      variazioni_significative: built.context.variazioni_significative,
      operazioni: built.context.operazioni,
      task_aperti: built.context.task_aperti.slice(0, 10),
    };
    built.sources.forEach((s) => sources.items.push(s));
  }
  const context = {
    alert: { tipo: alert.type, severita: ALERT_SEVERITY_LABELS[alert.severity], titolo: alert.title, messaggio: alert.message, dati: alert.data, rilevato_il: formatDate(alert.firstDetectedAt) },
    contesto_azienda: companyContext,
  };
  const { result, runId } = await runAI(ctx, { kind: "NEXT_BEST_ACTION", companyId: alert.companyId, input: context }, provider, async () => {
    const r = await provider.generateObject({
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: nextBestActionPrompt(context),
      schema: nextBestActionSchema,
      schemaName: "next_best_action",
      effort: "medium",
    });
    return { result: r.object, output: r.object, usage: r.usage };
  });
  await db.insight.updateMany({ where: { organizationId: ctx.organizationId, alertId, kind: "NEXT_BEST_ACTION", status: "ACTIVE" }, data: { status: "DISMISSED" } });
  const insight = await saveInsight(ctx, {
    kind: "NEXT_BEST_ACTION",
    title: result.recommended_action,
    summary: result.reason,
    content: { ...result, model: provider.model, provider: provider.name },
    sourceRefs: [{ id: "A", type: "Alert", entityId: alert.id, label: `Alert: ${alert.title}`, href: null }, ...sources.items],
    aiRunId: runId,
    companyId: alert.companyId,
    alertId,
    severity: alert.severity,
  });
  await audit(ctx, { action: "ai.next_best_action", entityType: "Insight", entityId: insight.id, companyId: alert.companyId, aiRunId: runId, metadata: { alertId, model: provider.model } });
  return insight;
}

export async function generateOperationSummary(ctx: ServiceContext, operationId: string) {
  authorize(ctx, "ai:use");
  const provider = requireAIProvider();
  const op = await getOperation(ctx, operationId);
  const documents = await listDocuments(ctx, { companyId: op.companyId, limit: 40 });
  const sources = new SourceRegistry();
  const context = {
    data_odierna: formatDate(new Date()),
    operazione: {
      source: sources.add("FinancingOperation", op.id, `Operazione: ${op.title}`, `/operations/${op.id}`),
      titolo: op.title,
      azienda: op.company.name,
      banca: op.bank,
      tipo: OPERATION_TYPE_LABELS[op.type],
      stato: OPERATION_STATUS_LABELS[op.status],
      importo: formatCurrency(op.amount),
      tasso_percentuale: op.rate,
      durata_mesi: op.durationMonths,
      scadenza: toIsoDate(op.maturityDate),
      probabilita: op.probability,
      garanzia: op.guarantee,
      note: op.notes,
    },
    checklist: op.checklist.map((i) => ({
      documento: i.name,
      tipo: DOCUMENT_TYPE_LABELS[i.documentType],
      obbligatorio: i.required,
      stato: CHECKLIST_STATUS_LABELS[i.status],
      scadenza_richiesta: toIsoDate(i.dueDate),
      file_collegato: i.document?.fileName ?? null,
    })),
    documenti_azienda_disponibili: documents.map((d) => ({
      source: sources.add("Document", d.id, d.fileName, `/documents/${d.id}`),
      nome_file: d.fileName,
      tipo: DOCUMENT_TYPE_LABELS[d.type],
      esercizio: d.fiscalYear,
    })),
    task: op.tasks.map((t) => ({ titolo: t.title, stato: TASK_STATUS_LABELS[t.status], scadenza: toIsoDate(t.dueDate) })),
  };
  const { result, runId } = await runAI(ctx, { kind: "OPERATION_SUMMARY", companyId: op.companyId, input: context }, provider, async () => {
    const r = await provider.generateObject({
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: operationSummaryPrompt(context),
      schema: operationSummarySchema,
      schemaName: "operation_summary",
      effort: "medium",
    });
    return { result: r.object, output: r.object, usage: r.usage };
  });
  const insight = await saveInsight(ctx, {
    kind: "OPERATION_SUMMARY",
    title: `Sintesi operazione — ${op.title}`,
    summary: result.summary,
    content: { ...result, model: provider.model, provider: provider.name },
    sourceRefs: sources.items,
    aiRunId: runId,
    companyId: op.companyId,
    operationId,
  });
  await audit(ctx, { action: "ai.operation_summary", entityType: "Insight", entityId: insight.id, companyId: op.companyId, aiRunId: runId, metadata: { operationId, model: provider.model } });
  return insight;
}

export async function generateDailyBriefing(ctx: ServiceContext, { force = false }: { force?: boolean } = {}) {
  authorize(ctx, "ai:use");
  if (!force) {
    const existing = await db.insight.findFirst({
      where: { organizationId: ctx.organizationId, kind: "DAILY_BRIEFING", status: "ACTIVE", createdAt: { gte: startOfDay() } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
  }
  const provider = requireAIProvider();
  const dashboard = await getDashboard(ctx);
  const context = {
    data_odierna: formatDate(new Date()),
    contatori: dashboard.counts,
    aziende_che_richiedono_attenzione: dashboard.attention.map((a) => ({
      azienda: a.companyName,
      punteggio_priorita: a.score,
      elementi: a.items.map((i) => ({ testo: i.text, dettaglio: i.detail, severita: ALERT_SEVERITY_LABELS[i.severity] })),
    })),
    task_in_scadenza: dashboard.tasks.map((t) => ({ titolo: t.title, azienda: t.company?.name ?? null, scadenza: toIsoDate(t.dueDate), priorita: TASK_PRIORITY_LABELS[t.priority] })),
  };
  const { result, runId } = await runAI(ctx, { kind: "DAILY_BRIEFING", input: context }, provider, async () => {
    const r = await provider.generateObject({
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: dailyBriefingPrompt(context),
      schema: dailyBriefingSchema,
      schemaName: "daily_briefing",
      effort: "low",
    });
    return { result: r.object, output: r.object, usage: r.usage };
  });
  await db.insight.updateMany({
    where: { organizationId: ctx.organizationId, kind: "DAILY_BRIEFING", status: "ACTIVE" },
    data: { status: "DISMISSED" },
  });
  const insight = await saveInsight(ctx, {
    kind: "DAILY_BRIEFING",
    title: result.headline,
    summary: result.focus_of_the_day,
    content: { ...result, model: provider.model, provider: provider.name },
    sourceRefs: dashboard.attention.map((a, i) => ({ id: `S${i + 1}`, type: "Company", entityId: a.companyId, label: a.companyName, href: `/companies/${a.companyId}` })),
    aiRunId: runId,
  });
  await audit(ctx, { action: "ai.daily_briefing", entityType: "Insight", entityId: insight.id, aiRunId: runId, metadata: { model: provider.model } });
  return insight;
}
