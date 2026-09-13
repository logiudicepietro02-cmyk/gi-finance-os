import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { generateClientBriefing } from "@/services/ai-analysis";
import { listAlerts, syncAlerts, updateAlertStatus } from "@/services/alerts";
import { decideApproval } from "@/services/approvals";
import { createCompany } from "@/services/companies";
import { askCopilot } from "@/services/copilot";
import { createStatement, updateStatement } from "@/services/financials";
import { executeTool } from "@/lib/ai/tools";
import { createOrgFixture, deleteOrg, uniqueVat } from "./helpers";

let F: Awaited<ReturnType<typeof createOrgFixture>>;
let companyId = "";
let statementId = "";

beforeAll(async () => {
  F = await createOrgFixture("Alerts");
  companyId = (await createCompany(F.owner, { name: "Sorveglianza S.r.l.", vatNumber: uniqueVat() })).id;
  const statement = await createStatement(F.owner, companyId, {
    fiscalYear: 2025,
    values: { revenue: 5_000_000, ebitda: 600_000, ebit: 400_000, interestExpense: 150_000, principalRepayment: 550_000, financialDebt: 2_000_000, cash: 300_000 },
  });
  statementId = statement.id;
});

afterAll(async () => {
  delete process.env.ALLOW_SCRIPTED_AI;
  process.env.AI_PROVIDER = "none";
  await deleteOrg(F.org.id);
});

describe("alert engine sync", () => {
  it("creates, dedupes and auto-resolves alerts", async () => {
    let alerts = await listAlerts(F.owner, { companyId });
    expect(alerts.map((a) => a.type)).toEqual(["DSCR_BELOW_THRESHOLD"]); // 600k / 700k = 0.86
    expect(alerts[0].severity).toBe("CRITICAL");

    await syncAlerts(F.org.id);
    expect(await db.alert.count({ where: { organizationId: F.org.id } })).toBe(1);

    await updateAlertStatus(F.owner, alerts[0].id, "acknowledge");
    await updateStatement(F.owner, statementId, { values: { ebitda: 1_200_000 } });
    alerts = await listAlerts(F.owner, { companyId, scope: "all" });
    expect(alerts[0].status).toBe("RESOLVED");

    await updateStatement(F.owner, statementId, { values: { ebitda: 500_000 } });
    alerts = await listAlerts(F.owner, { companyId });
    expect(alerts[0].status).toBe("OPEN");
  });
});

describe("AI plumbing with the test provider", () => {
  beforeAll(() => {
    process.env.AI_PROVIDER = "scripted";
    process.env.ALLOW_SCRIPTED_AI = "1";
  });

  it("copilot runs tools with the conversation company context, logs AIRun and audits tool calls", async () => {
    const res = await askCopilot(F.advisor, { companyId, message: "Analizza l'azienda" });
    expect(res.message.content).toContain("Sorveglianza S.r.l.");
    const run = await db.aIRun.findFirstOrThrow({ where: { organizationId: F.org.id, kind: "COPILOT" } });
    expect(run.status).toBe("SUCCEEDED");
    const toolAudits = await db.auditLog.findMany({ where: { organizationId: F.org.id, action: "ai.tool_call", aiRunId: run.id } });
    expect(toolAudits.map((a) => a.toolName).sort()).toEqual(["get_company", "get_company_financials"]);
    expect(toolAudits.every((a) => a.actorType === "AI")).toBe(true);
    const messages = await db.aIMessage.count({ where: { conversationId: res.conversationId } });
    expect(messages).toBe(2);
  });

  it("client briefing is schema-validated and stored with sources", async () => {
    const insight = await generateClientBriefing(F.advisor, companyId);
    expect(insight.kind).toBe("CLIENT_BRIEFING");
    expect(Array.isArray(insight.sourceRefs)).toBe(true);
    expect((insight.sourceRefs as unknown[]).length).toBeGreaterThan(0);
  });

  it("create_task tool: high priority requires approval, approval creates the task", async () => {
    const result = await executeTool("create_task", { svc: F.advisor, companyId, aiRunId: null }, { title: "Chiamare la banca", priority: "HIGH" });
    expect(result.ok).toBe(true);
    const out = result.output as { status: string; approval_id: string };
    expect(out.status).toBe("PENDING_APPROVAL");
    expect(await db.task.count({ where: { organizationId: F.org.id, title: "Chiamare la banca" } })).toBe(0);

    await expect(decideApproval(F.analyst, out.approval_id, "APPROVE")).rejects.toThrow();
    await decideApproval(F.advisor, out.approval_id, "APPROVE");
    const task = await db.task.findFirstOrThrow({ where: { organizationId: F.org.id, title: "Chiamare la banca" } });
    expect(task.source).toBe("AI");

    const low = await executeTool("create_task", { svc: F.advisor, companyId, aiRunId: null }, { title: "Promemoria", priority: "LOW" });
    expect((low.output as { status: string }).status).toBe("CREATED");
  });
});
