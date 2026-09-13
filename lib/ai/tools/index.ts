/**
 * AI tools: the only way the LLM can read or change data.
 * Each tool declares input schema, output schema and the permission it requires;
 * every call is authorized against the user's ServiceContext and written to the audit log.
 *
 * Read tools query `db` directly (same `organizationId`-scoped pattern as services/*) rather than
 * going through services/*, because they reshape data for the model's schema, not the UI's. This is
 * a deliberate, documented exception to the "only services/workers touch the DB" rule (docs/architecture.md)
 * — authorization, org-scoping and audit still apply to every call via executeTool() below. Mutations
 * (e.g. create_task) go through services/* like everything else.
 */
import { z } from "zod";
import { audit } from "@/lib/audit";
import { startOfDay, toIsoDate } from "@/lib/dates";
import { db, toJson, type Prisma } from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { statementToValues, toNumber } from "@/lib/financial/fields";
import { formatRatio } from "@/lib/financial/format";
import { RATIO_KEYS, computeRatio, type RatioResult } from "@/lib/financial/ratios";
import { significantChanges, computeVariations } from "@/lib/financial/variations";
import { missingRequiredItems } from "@/lib/operations/checklist";
import { ForbiddenError, NotFoundError, type Permission } from "@/lib/permissions";
import { assertCompanyInOrg } from "@/services/companies";
import { authorize, type ServiceContext } from "@/services/context";
import { searchCompanyKnowledge } from "@/services/search";
import { createTask } from "@/services/tasks";
import { toToolJsonSchema } from "../json-schema";
import type { ToolExecutionResult, ToolSpec } from "../types";

export class ToolError extends Error {}

export interface ToolContext {
  svc: ServiceContext;
  /** Company the conversation is about (used when the model omits company_id) */
  companyId: string | null;
  aiRunId: string | null;
}

interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  description: string;
  permission: Permission;
  input: I;
  output: O;
  execute: (ctx: ToolContext, input: z.output<I>) => Promise<z.input<O>>;
}

function defineTool<I extends z.ZodType, O extends z.ZodType>(def: ToolDefinition<I, O>) {
  return def;
}

// ─── Shared schemas ───────────────────────────────────────
const companyRef = {
  company_id: z.string().nullish().describe("ID dell'azienda. Se omesso si usa l'azienda del contesto corrente."),
  company_name: z.string().nullish().describe("Nome (anche parziale) dell'azienda, in alternativa a company_id."),
};

const ratioOutput = z.object({
  key: z.string(),
  label: z.string(),
  fiscal_year: z.number().int(),
  value: z.number().nullable(),
  formatted: z.string(),
  status: z.enum(["OK", "MISSING", "NOT_MEANINGFUL"]),
  formula: z.string(),
  note: z.string().nullable(),
});

const LEGAL_FORMS = new Set(["srl", "s.r.l.", "spa", "s.p.a.", "sas", "snc", "srls", "azienda", "società", "societa"]);

async function resolveCompany(ctx: ToolContext, input: { company_id?: string | null; company_name?: string | null }) {
  if (input.company_id) return assertCompanyInOrg(ctx.svc, input.company_id);
  if (input.company_name?.trim()) {
    const tokens = input.company_name
      .toLowerCase()
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !LEGAL_FORMS.has(t));
    if (tokens.length === 0) throw new ToolError("Nome azienda non valido.");
    const matches = await db.company.findMany({
      where: { organizationId: ctx.svc.organizationId, AND: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
      select: { id: true, name: true },
      take: 5,
    });
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) throw new ToolError(`Nessuna azienda trovata per "${input.company_name}".`);
    throw new ToolError(`Più aziende corrispondono a "${input.company_name}": ${matches.map((m) => `${m.name} (${m.id})`).join(", ")}. Specifica company_id.`);
  }
  if (ctx.companyId) return assertCompanyInOrg(ctx.svc, ctx.companyId);
  throw new ToolError("Nessuna azienda nel contesto: indica company_id o company_name.");
}

function ratioToOutput(r: RatioResult, fiscalYear: number) {
  return { key: r.key, label: r.label, fiscal_year: fiscalYear, value: r.value, formatted: formatRatio(r), status: r.status, formula: r.formula, note: r.note };
}

// ─── Tools ────────────────────────────────────────────────
const getCompany = defineTool({
  name: "get_company",
  description:
    "Anagrafica dell'azienda (settore, sede, dipendenti, stato, consulente, referenti, ultimo fatturato). Senza company_id/company_name e senza contesto restituisce l'elenco delle aziende (candidates).",
  permission: "company:read",
  input: z.object(companyRef),
  output: z.object({
    company: z
      .object({
        id: z.string(),
        name: z.string(),
        legal_form: z.string().nullable(),
        vat_number: z.string().nullable(),
        sector: z.string().nullable(),
        ateco_code: z.string().nullable(),
        city: z.string().nullable(),
        province: z.string().nullable(),
        employees: z.number().nullable(),
        status: z.string(),
        assigned_advisor: z.string().nullable(),
        latest_revenue: z.number().nullable(),
        latest_revenue_year: z.number().nullable(),
        description: z.string().nullable(),
        contacts: z.array(z.object({ name: z.string(), role: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable() })),
      })
      .nullable(),
    candidates: z.array(z.object({ id: z.string(), name: z.string(), city: z.string().nullable() })),
  }),
  async execute(ctx, input) {
    if (!input.company_id && !input.company_name && !ctx.companyId) {
      const companies = await db.company.findMany({
        where: { organizationId: ctx.svc.organizationId },
        select: { id: true, name: true, city: true },
        orderBy: { name: "asc" },
        take: 50,
      });
      return { company: null, candidates: companies };
    }
    const ref = await resolveCompany(ctx, input);
    const c = await db.company.findFirstOrThrow({
      where: { id: ref.id, organizationId: ctx.svc.organizationId },
      include: {
        assignedAdvisor: { select: { name: true } },
        contacts: true,
        statements: { where: { type: "ANNUAL" }, orderBy: { fiscalYear: "desc" }, take: 1 },
      },
    });
    const latest = c.statements[0];
    return {
      company: {
        id: c.id,
        name: c.name,
        legal_form: c.legalForm,
        vat_number: c.vatNumber,
        sector: c.sector,
        ateco_code: c.atecoCode,
        city: c.city,
        province: c.province,
        employees: c.employees,
        status: c.status,
        assigned_advisor: c.assignedAdvisor?.name ?? null,
        latest_revenue: latest ? toNumber(latest.revenue) : toNumber(c.declaredRevenue),
        latest_revenue_year: latest?.fiscalYear ?? null,
        description: c.description,
        contacts: c.contacts.map((x) => ({ name: x.name, role: x.role, email: x.email, phone: x.phone })),
      },
      candidates: [],
    };
  },
});

const getCompanyFinancials = defineTool({
  name: "get_company_financials",
  description:
    "Bilanci dell'azienda per anno (valori in euro, stato di verifica, documento sorgente), indicatori dell'ultimo esercizio calcolati dal sistema e variazioni significative rispetto all'anno precedente.",
  permission: "company:read",
  input: z.object(companyRef),
  output: z.object({
    company: z.object({ id: z.string(), name: z.string() }),
    statements: z.array(
      z.object({
        fiscal_year: z.number().int(),
        status: z.string(),
        source_document: z.string().nullable(),
        values: z.record(z.string(), z.number().nullable()),
      }),
    ),
    latest_ratios: z.array(ratioOutput),
    significant_changes: z.array(z.object({ text: z.string(), favorable: z.boolean().nullable() })),
    note: z.string(),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const statements = await db.financialStatement.findMany({
      where: { organizationId: ctx.svc.organizationId, companyId: company.id, type: "ANNUAL" },
      orderBy: { fiscalYear: "asc" },
      include: { sourceDocument: { select: { fileName: true } } },
    });
    const latest = statements.at(-1);
    const previous = statements.length > 1 ? statements[statements.length - 2] : undefined;
    const latestValues = latest ? statementToValues(latest) : null;
    return {
      company,
      statements: statements.map((s) => ({
        fiscal_year: s.fiscalYear,
        status: s.status === "VERIFIED" ? "VERIFICATO" : "DA VERIFICARE",
        source_document: s.sourceDocument?.fileName ?? null,
        values: Object.fromEntries(Object.entries(statementToValues(s)).filter(([, v]) => v !== null)) as Record<string, number | null>,
      })),
      latest_ratios: latest && latestValues ? RATIO_KEYS.map((k) => ratioToOutput(computeRatio(k, latestValues), latest.fiscalYear)) : [],
      significant_changes:
        latestValues && previous
          ? significantChanges(computeVariations(latestValues, statementToValues(previous))).map((c) => ({ text: c.message, favorable: c.favorable }))
          : [],
      note: "Importi in euro. Percentuali espresse come frazione in 'value' (0,12 = 12%); usare 'formatted' per la citazione.",
    };
  },
});

const getCompanyDocuments = defineTool({
  name: "get_company_documents",
  description: "Documenti caricati per l'azienda con tipo, esercizio, stato di analisi e stato della revisione dei dati estratti.",
  permission: "document:read",
  input: z.object({
    ...companyRef,
    type: z.enum(["BILANCIO", "VISURA", "DOCUMENTO_BANCARIO", "FINANZIAMENTO", "BUSINESS_PLAN", "SITUAZIONE_CONTABILE", "DOCUMENTO_IDENTITA", "ALTRO"]).nullish(),
  }),
  output: z.object({
    documents: z.array(
      z.object({
        id: z.string(),
        file_name: z.string(),
        type: z.string(),
        fiscal_year: z.number().nullable(),
        status: z.string(),
        uploaded_at: z.string(),
        extraction_status: z.string().nullable(),
      }),
    ),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const docs = await db.document.findMany({
      where: { organizationId: ctx.svc.organizationId, companyId: company.id, ...(input.type ? { type: input.type } : {}) },
      select: {
        id: true,
        fileName: true,
        type: true,
        fiscalYear: true,
        status: true,
        createdAt: true,
        extractions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      documents: docs.map((d) => ({
        id: d.id,
        file_name: d.fileName,
        type: d.type,
        fiscal_year: d.fiscalYear,
        status: d.status,
        uploaded_at: d.createdAt.toISOString(),
        extraction_status: d.extractions[0]?.status ?? null,
      })),
    };
  },
});

const getCompanyOperations = defineTool({
  name: "get_company_operations",
  description: "Operazioni finanziarie dell'azienda: banca, tipo, stato, importo, debito residuo, tasso, scadenza, probabilità e documenti obbligatori mancanti.",
  permission: "operation:read",
  input: z.object({ ...companyRef, include_closed: z.boolean().nullish().describe("Includi operazioni completate o respinte") }),
  output: z.object({
    operations: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        bank: z.string(),
        type: z.string(),
        status: z.string(),
        amount: z.number().nullable(),
        outstanding_debt: z.number().nullable(),
        rate_percent: z.number().nullable(),
        maturity_date: z.string().nullable(),
        probability: z.number().nullable(),
        documents_required: z.number().int(),
        documents_received: z.number().int(),
        missing_documents: z.array(z.string()),
        notes: z.string().nullable(),
      }),
    ),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const ops = await db.financingOperation.findMany({
      where: {
        organizationId: ctx.svc.organizationId,
        companyId: company.id,
        ...(input.include_closed ? {} : { status: { notIn: ["COMPLETED", "REJECTED"] } }),
      },
      include: { checklist: { select: { name: true, required: true, status: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return {
      operations: ops.map((o) => {
        const required = o.checklist.filter((i) => i.required);
        const missing = missingRequiredItems(o.checklist);
        return {
          id: o.id,
          title: o.title,
          bank: o.bank,
          type: o.type,
          status: o.status,
          amount: toNumber(o.amount),
          outstanding_debt: toNumber(o.outstandingDebt),
          rate_percent: toNumber(o.rate),
          maturity_date: toIsoDate(o.maturityDate),
          probability: o.probability,
          documents_required: required.length,
          documents_received: required.length - missing.length,
          missing_documents: missing.map((i) => i.name),
          notes: o.notes,
        };
      }),
    };
  },
});

const getCompanyTasks = defineTool({
  name: "get_company_tasks",
  description: "Task dell'azienda con stato, priorità, scadenza, assegnatario e indicazione se scaduti.",
  permission: "task:read",
  input: z.object({ ...companyRef, include_done: z.boolean().nullish() }),
  output: z.object({
    tasks: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        priority: z.string(),
        due_date: z.string().nullable(),
        assignee: z.string().nullable(),
        overdue: z.boolean(),
      }),
    ),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const today = startOfDay();
    const tasks = await db.task.findMany({
      where: { organizationId: ctx.svc.organizationId, companyId: company.id, ...(input.include_done ? {} : { status: { not: "DONE" } }) },
      include: { assignee: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 100,
    });
    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_date: toIsoDate(t.dueDate),
        assignee: t.assignee?.name ?? null,
        overdue: t.status !== "DONE" && !!t.dueDate && t.dueDate < today,
      })),
    };
  },
});

const getCompanyAlerts = defineTool({
  name: "get_company_alerts",
  description: "Alert attivi dell'azienda generati dalle regole deterministiche (DSCR, PFN/EBITDA, scadenze, documenti mancanti, task scaduti).",
  permission: "company:read",
  input: z.object(companyRef),
  output: z.object({
    alerts: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        severity: z.string(),
        status: z.string(),
        title: z.string(),
        message: z.string(),
        detected_at: z.string(),
      }),
    ),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const alerts = await db.alert.findMany({
      where: { organizationId: ctx.svc.organizationId, companyId: company.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      orderBy: { lastDetectedAt: "desc" },
    });
    return {
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        status: a.status,
        title: a.title,
        message: a.message,
        detected_at: a.firstDetectedAt.toISOString(),
      })),
    };
  },
});

const calculateFinancialRatio = defineTool({
  name: "calculate_financial_ratio",
  description:
    "Calcola in modo deterministico un indicatore finanziario per un esercizio (default: ultimo disponibile) e restituisce valore, formula e input. Usalo invece di fare calcoli.",
  permission: "company:read",
  input: z.object({
    ...companyRef,
    ratio: z.enum(RATIO_KEYS).describe("Indicatore da calcolare"),
    fiscal_year: z.number().int().nullish().describe("Esercizio; se omesso l'ultimo disponibile"),
  }),
  output: ratioOutput.extend({
    description: z.string(),
    inputs: z.array(z.object({ label: z.string(), value: z.number().nullable() })),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const statement = await db.financialStatement.findFirst({
      where: {
        organizationId: ctx.svc.organizationId,
        companyId: company.id,
        type: "ANNUAL",
        ...(input.fiscal_year ? { fiscalYear: input.fiscal_year } : {}),
      },
      orderBy: { fiscalYear: "desc" },
    });
    if (!statement) {
      throw new ToolError(input.fiscal_year ? `Nessun bilancio ${input.fiscal_year} disponibile.` : "Nessun bilancio disponibile per l'azienda.");
    }
    const r = computeRatio(input.ratio, statementToValues(statement));
    return { ...ratioToOutput(r, statement.fiscalYear), description: r.description, inputs: r.inputs.map((i) => ({ label: i.label, value: i.value })) };
  },
});

const searchKnowledge = defineTool({
  name: "search_company_knowledge",
  description: "Ricerca full-text nel testo dei documenti dell'azienda. Restituisce estratti con documento e pagina da citare come fonte.",
  permission: "document:read",
  input: z.object({
    ...companyRef,
    query: z.string().min(2).max(200).describe("Parole chiave o frase da cercare"),
    limit: z.number().int().min(1).max(10).nullish(),
  }),
  output: z.object({
    results: z.array(z.object({ document_id: z.string(), file_name: z.string(), document_type: z.string(), page: z.number().int(), snippet: z.string() })),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const hits = await searchCompanyKnowledge(ctx.svc, company.id, input.query, input.limit ?? 6);
    return {
      results: hits.map((h) => ({ document_id: h.documentId, file_name: h.fileName, document_type: h.documentType, page: h.page, snippet: h.snippet })),
    };
  },
});

const createTaskTool = defineTool({
  name: "create_task",
  description:
    "Crea un task per il consulente. Usalo solo su richiesta esplicita. Priorità LOW/MEDIUM: creato subito. Priorità HIGH/CRITICAL: viene creata una richiesta di approvazione (nessun task finché un Advisor/Owner non approva).",
  permission: "task:write",
  input: z.object({
    ...companyRef,
    title: z.string().min(3).max(200),
    description: z.string().max(2000).nullish(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().describe("Scadenza YYYY-MM-DD"),
    operation_id: z.string().nullish(),
  }),
  output: z.object({
    status: z.enum(["CREATED", "PENDING_APPROVAL"]),
    task_id: z.string().nullable(),
    approval_id: z.string().nullable(),
    message: z.string(),
  }),
  async execute(ctx, input) {
    const company = await resolveCompany(ctx, input);
    const payload = {
      title: input.title,
      description: input.description ?? null,
      companyId: company.id,
      operationId: input.operation_id ?? null,
      priority: input.priority,
      dueDate: input.due_date ?? null,
    };
    if (input.priority === "HIGH" || input.priority === "CRITICAL") {
      const approval = await db.approvalRequest.create({
        data: {
          organizationId: ctx.svc.organizationId,
          companyId: company.id,
          type: "CREATE_TASK",
          title: `Creare task: ${input.title}`,
          reason: "Task ad alta priorità proposto dall'AI: richiede approvazione.",
          payload: toJson(payload) as Prisma.InputJsonValue,
          requestedByUserId: ctx.svc.userId,
          aiRunId: ctx.aiRunId,
        },
      });
      await audit(ctx.svc, {
        action: "approval.request",
        entityType: "ApprovalRequest",
        entityId: approval.id,
        companyId: company.id,
        actorType: "AI",
        aiRunId: ctx.aiRunId,
        toolName: "create_task",
        metadata: { title: input.title, priority: input.priority },
      });
      return { status: "PENDING_APPROVAL" as const, task_id: null, approval_id: approval.id, message: "Task ad alta priorità in attesa di approvazione." };
    }
    const task = await createTask(ctx.svc, payload, { source: "AI", aiRunId: ctx.aiRunId, actorType: "AI" });
    return { status: "CREATED" as const, task_id: task.id, approval_id: null, message: `Task creato: ${task.title}` };
  },
});

export const AI_TOOLS = [
  getCompany,
  getCompanyFinancials,
  getCompanyDocuments,
  getCompanyOperations,
  getCompanyTasks,
  getCompanyAlerts,
  calculateFinancialRatio,
  searchKnowledge,
  createTaskTool,
] as const;

const TOOLS_BY_NAME = new Map<string, ToolDefinition<z.ZodType, z.ZodType>>(
  AI_TOOLS.map((t) => [t.name, t as unknown as ToolDefinition<z.ZodType, z.ZodType>]),
);

export function toolSpecs(): ToolSpec[] {
  return AI_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: toToolJsonSchema(t.input) }));
}

const MAX_AUDIT_OUTPUT = 8_000;

/** Validates input, authorizes, executes, validates output and audits. Never throws: errors go back to the model. */
export async function executeTool(name: string, ctx: ToolContext, rawInput: unknown): Promise<ToolExecutionResult> {
  const tool = TOOLS_BY_NAME.get(name);
  const started = Date.now();
  let input: unknown = rawInput;
  try {
    if (!tool) throw new ToolError(`Tool sconosciuto: ${name}`);
    authorize(ctx.svc, tool.permission);
    input = tool.input.parse(rawInput ?? {});
    const output = tool.output.parse(await tool.execute(ctx, input));
    const outputText = JSON.stringify(output);
    await audit(ctx.svc, {
      action: "ai.tool_call",
      entityType: "AITool",
      entityId: name,
      companyId: ctx.companyId,
      actorType: "AI",
      aiRunId: ctx.aiRunId,
      toolName: name,
      metadata: {
        ok: true,
        input,
        output: outputText.length > MAX_AUDIT_OUTPUT ? { truncated: true, preview: outputText.slice(0, MAX_AUDIT_OUTPUT) } : output,
        durationMs: Date.now() - started,
      },
    });
    return { ok: true, output };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? `Parametri non validi: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        : error instanceof ToolError || error instanceof ForbiddenError || error instanceof NotFoundError
          ? error.message
          : `Errore interno del tool: ${errorMessage(error)}`;
    await audit(ctx.svc, {
      action: "ai.tool_call",
      entityType: "AITool",
      entityId: name,
      companyId: ctx.companyId,
      actorType: "AI",
      aiRunId: ctx.aiRunId,
      toolName: name,
      metadata: { ok: false, input, error: message, durationMs: Date.now() - started },
    }).catch(() => undefined);
    return { ok: false, output: null, error: message };
  }
}
