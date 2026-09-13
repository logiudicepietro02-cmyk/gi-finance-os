import { requireAIProvider } from "@/lib/ai";
import { runAI } from "@/lib/ai/runs";
import { copilotSystemPrompt } from "@/lib/ai/prompts";
import { executeTool, toolSpecs } from "@/lib/ai/tools";
import type { ChatMessage, ToolCallRecord } from "@/lib/ai/types";
import { audit } from "@/lib/audit";
import { formatDate } from "@/lib/financial/format";
import { db, toJson, type Prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/permissions";
import { copilotAskSchema } from "@/lib/validation/schemas";
import { assertCompanyInOrg } from "./companies";
import { authorize, type ServiceContext } from "./context";
import type { SourceRef } from "./insights";

const HISTORY_LIMIT = 20;

export async function listConversations(ctx: ServiceContext, filters: { companyId?: string } = {}) {
  authorize(ctx, "ai:use");
  return db.aIConversation.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId, ...(filters.companyId ? { companyId: filters.companyId } : {}) },
    include: { company: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}

export async function getConversation(ctx: ServiceContext, conversationId: string) {
  authorize(ctx, "ai:use");
  const conversation = await db.aIConversation.findFirst({
    where: { id: conversationId, organizationId: ctx.organizationId, userId: ctx.userId },
    include: { company: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) throw new NotFoundError("Conversazione");
  return conversation;
}

/** Derives human-readable sources from the tools the model actually used. */
function collectSources(toolCalls: ToolCallRecord[]): SourceRef[] {
  const sources: SourceRef[] = [];
  const add = (type: string, entityId: string | null, label: string, href: string | null) => {
    if (sources.some((s) => s.type === type && s.entityId === entityId && s.label === label)) return;
    sources.push({ id: `S${sources.length + 1}`, type, entityId, label, href });
  };
  for (const call of toolCalls) {
    if (!call.ok || !call.output) continue;
    const out = call.output as Record<string, unknown>;
    switch (call.name) {
      case "get_company": {
        const c = out.company as { id: string; name: string } | null;
        if (c) add("Company", c.id, `Anagrafica ${c.name}`, `/companies/${c.id}`);
        break;
      }
      case "get_company_financials": {
        const c = out.company as { id: string; name: string };
        for (const s of (out.statements as { fiscal_year: number; status: string; source_document: string | null }[]) ?? []) {
          add("FinancialStatement", c.id, `Bilancio ${s.fiscal_year} (${s.status.toLowerCase()})${s.source_document ? ` — ${s.source_document}` : ""}`, `/companies/${c.id}?tab=analysis`);
        }
        break;
      }
      case "calculate_financial_ratio":
        add("Ratio", null, `${out.label} ${out.fiscal_year}: ${out.formula}`, null);
        break;
      case "get_company_documents":
        for (const d of ((out.documents as { id: string; file_name: string }[]) ?? []).slice(0, 10)) add("Document", d.id, d.file_name, `/documents/${d.id}`);
        break;
      case "search_company_knowledge":
        for (const r of (out.results as { document_id: string; file_name: string; page: number }[]) ?? []) {
          add("Document", r.document_id, `${r.file_name}, pag. ${r.page}`, `/documents/${r.document_id}`);
        }
        break;
      case "get_company_operations":
        for (const o of (out.operations as { id: string; title: string; bank: string }[]) ?? []) add("FinancingOperation", o.id, `${o.title} — ${o.bank}`, `/operations/${o.id}`);
        break;
      case "get_company_alerts":
        if (((out.alerts as unknown[]) ?? []).length) add("Alert", null, "Alert attivi dell'azienda", null);
        break;
      case "get_company_tasks":
        if (((out.tasks as unknown[]) ?? []).length) add("Task", null, "Task dell'azienda", "/tasks");
        break;
      case "create_task":
        if (out.task_id) add("Task", out.task_id as string, "Task creato dal copilot", "/tasks");
        if (out.approval_id) add("ApprovalRequest", out.approval_id as string, "Richiesta di approvazione task", null);
        break;
    }
  }
  return sources;
}

export async function askCopilot(ctx: ServiceContext, rawInput: unknown) {
  authorize(ctx, "ai:use");
  const input = copilotAskSchema.parse(rawInput);
  const provider = requireAIProvider();

  let conversation = input.conversationId
    ? await db.aIConversation.findFirst({ where: { id: input.conversationId, organizationId: ctx.organizationId, userId: ctx.userId } })
    : null;
  if (input.conversationId && !conversation) throw new NotFoundError("Conversazione");

  const companyId = conversation?.companyId ?? input.companyId ?? null;
  const company = companyId ? await assertCompanyInOrg(ctx, companyId) : null;
  if (!conversation) {
    conversation = await db.aIConversation.create({
      data: { organizationId: ctx.organizationId, userId: ctx.userId, companyId, title: input.message.slice(0, 80) },
    });
  }

  const history = await db.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  await db.aIMessage.create({
    data: { organizationId: ctx.organizationId, conversationId: conversation.id, role: "USER", content: input.message },
  });

  const messages: ChatMessage[] = [
    ...history.reverse().map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user", content: input.message },
  ];
  const system = copilotSystemPrompt({
    userName: ctx.userName,
    companyName: company?.name ?? null,
    companyId: company?.id ?? null,
    today: formatDate(new Date()),
  });
  const conversationId = conversation.id;

  const { result, runId } = await runAI(
    ctx,
    { kind: "COPILOT", companyId, input: { conversationId, message: input.message, historyMessages: history.length } },
    provider,
    async (aiRunId) => {
      const r = await provider.runWithTools({
        system,
        messages,
        tools: toolSpecs(),
        executeTool: (name, toolInput) => executeTool(name, { svc: ctx, companyId, aiRunId }, toolInput),
        maxIterations: 8,
      });
      return {
        result: r,
        output: { text: r.text, iterations: r.iterations, toolCalls: r.toolCalls.map((t) => ({ name: t.name, input: t.input, ok: t.ok, error: t.error })) },
        usage: r.usage,
      };
    },
  );

  const sources = collectSources(result.toolCalls);
  const assistant = await db.aIMessage.create({
    data: {
      organizationId: ctx.organizationId,
      conversationId,
      role: "ASSISTANT",
      content: result.text || "Non è stato possibile generare una risposta.",
      toolCalls: toJson(result.toolCalls.map((t) => ({ name: t.name, input: t.input, ok: t.ok, error: t.error, durationMs: t.durationMs }))) as Prisma.InputJsonValue,
      sources: toJson(sources) as Prisma.InputJsonValue,
      aiRunId: runId,
    },
  });
  await db.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  await audit(ctx, {
    action: "ai.copilot",
    entityType: "AIConversation",
    entityId: conversationId,
    companyId,
    aiRunId: runId,
    metadata: { question: input.message.slice(0, 500), tools: result.toolCalls.map((t) => t.name), model: provider.model },
  });
  return { conversationId, message: assistant, provider: { name: provider.name, model: provider.model } };
}
