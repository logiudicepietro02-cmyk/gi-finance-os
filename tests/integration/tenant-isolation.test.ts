import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeTool } from "@/lib/ai/tools";
import { db } from "@/lib/db";
import { generateBilancioPdf } from "@/lib/documents/demo-pdf";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import { listActivity } from "@/services/activity";
import { listAlerts } from "@/services/alerts";
import { createCompany, deleteCompany, getCompany, listCompanies, updateCompany } from "@/services/companies";
import { getDashboard } from "@/services/dashboard";
import { getDocument, getDocumentFile, listDocuments, uploadDocument } from "@/services/documents";
import { approveExtraction, createStatement, getFinancialOverview } from "@/services/financials";
import { createOperation, getOperation, listOperations, updateChecklistItem } from "@/services/operations";
import { globalSearch, searchCompanyKnowledge } from "@/services/search";
import { createTask, listTasks, updateTask } from "@/services/tasks";
import { processDocument } from "@/workers/document-processor";
import { SAMPLE_FINANCIALS, createOrgFixture, deleteOrg, uniqueVat } from "./helpers";

type Fixture = Awaited<ReturnType<typeof createOrgFixture>>;

let A: Fixture;
let B: Fixture;
const bIds = { company: "", operation: "", task: "", document: "", extraction: "", checklistItem: "" };

beforeAll(async () => {
  A = await createOrgFixture("Alpha");
  B = await createOrgFixture("Bravo");

  const company = await createCompany(B.owner, { name: "Bravo Riservata S.r.l.", vatNumber: uniqueVat(), city: "Bari" });
  bIds.company = company.id;
  const bytes = await generateBilancioPdf({ companyName: company.name, vatNumber: company.vatNumber!, city: "Bari", fiscalYear: 2025, current: SAMPLE_FINANCIALS[2025] });
  const { document } = await uploadDocument(B.owner, { fileName: "bilancio.pdf", bytes, companyId: company.id });
  bIds.document = document.id;
  const processed = await processDocument(B.owner, document.id);
  bIds.extraction = processed.extractionId!;
  const operation = await createOperation(B.owner, { companyId: company.id, title: "Mutuo riservato", bank: "Banca B", type: "MUTUO_CHIROGRAFARIO" });
  bIds.operation = operation.id;
  const item = await db.financingDocument.findFirstOrThrow({ where: { operationId: operation.id } });
  bIds.checklistItem = item.id;
  const task = await createTask(B.owner, { title: "Task riservato", companyId: company.id });
  bIds.task = task.id;

  await createCompany(A.owner, { name: "Alpha Visibile S.r.l.", vatNumber: uniqueVat() });
});

afterAll(async () => {
  await deleteOrg(A.org.id);
  await deleteOrg(B.org.id);
});

describe("tenant isolation — services", () => {
  it("lists only the caller's organization data", async () => {
    const companies = await listCompanies(A.owner);
    expect(companies.map((c) => c.name)).toEqual(["Alpha Visibile S.r.l."]);
    expect(await listOperations(A.owner)).toHaveLength(0);
    expect(await listTasks(A.owner, { view: "all" })).toHaveLength(0);
    expect(await listDocuments(A.owner)).toHaveLength(0);
    expect(await listAlerts(A.owner, { scope: "all" })).toHaveLength(0);
    const search = await globalSearch(A.owner, "Bravo");
    expect(search.companies).toHaveLength(0);
  });

  it("returns NotFound (not Forbidden) for another organization's records", async () => {
    await expect(getCompany(A.owner, bIds.company)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateCompany(A.owner, bIds.company, { name: "Hack" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCompany(A.owner, bIds.company)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFinancialOverview(A.owner, bIds.company)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOperation(A.owner, bIds.operation)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTask(A.owner, bIds.task, { status: "DONE" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDocument(A.owner, bIds.document)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDocumentFile(A.owner, bIds.document)).rejects.toBeInstanceOf(NotFoundError);
    await expect(processDocument(A.owner, bIds.document)).rejects.toBeInstanceOf(NotFoundError);
    await expect(approveExtraction(A.owner, bIds.extraction)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateChecklistItem(A.owner, bIds.checklistItem, { status: "RECEIVED" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(searchCompanyKnowledge(A.owner, bIds.company, "patrimonio netto")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("prevents linking another organization's records", async () => {
    await expect(createTask(A.owner, { title: "Cross-tenant", companyId: bIds.company })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createTask(A.owner, { title: "Cross-tenant", operationId: bIds.operation })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createOperation(A.owner, { companyId: bIds.company, title: "Leasing cross-tenant", bank: "Banca Y", type: "LEASING" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createStatement(A.owner, bIds.company, { fiscalYear: 2024, values: {} })).rejects.toBeInstanceOf(NotFoundError);
    const bytes = await generateBilancioPdf({ companyName: "X S.r.l.", vatNumber: "00000000000", city: "X", fiscalYear: 2025, current: SAMPLE_FINANCIALS[2025] });
    await expect(uploadDocument(A.owner, { fileName: "x.pdf", bytes, companyId: bIds.company })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps activity, dashboard and knowledge separated", async () => {
    const activity = await listActivity(A.owner, { limit: 500 });
    expect(activity.every((a) => a.organizationId === A.org.id)).toBe(true);
    const dashboard = await getDashboard(A.owner);
    expect(dashboard.attention.every((e) => e.companyId !== bIds.company)).toBe(true);
    expect(dashboard.counts.documentsToReview).toBe(0);
    const hits = await searchCompanyKnowledge(B.owner, bIds.company, "patrimonio netto");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("AI tools cannot reach another organization", async () => {
    const byId = await executeTool("get_company", { svc: A.owner, companyId: null, aiRunId: null }, { company_id: bIds.company });
    expect(byId.ok).toBe(false);
    expect(byId.error).toMatch(/non trovata/);

    const byName = await executeTool("get_company_financials", { svc: A.owner, companyId: null, aiRunId: null }, { company_name: "Bravo Riservata" });
    expect(byName.ok).toBe(false);

    const viaContext = await executeTool("get_company_operations", { svc: A.owner, companyId: bIds.company, aiRunId: null }, {});
    expect(viaContext.ok).toBe(false);

    const list = await executeTool("get_company", { svc: A.owner, companyId: null, aiRunId: null }, {});
    expect(list.ok).toBe(true);
    const names = (list.output as { candidates: { name: string }[] }).candidates.map((c) => c.name);
    expect(names).not.toContain("Bravo Riservata S.r.l.");

    const audit = await db.auditLog.findMany({ where: { organizationId: A.org.id, action: "ai.tool_call" } });
    expect(audit.length).toBeGreaterThanOrEqual(4);
    expect(audit.some((a) => (a.metadata as { ok?: boolean }).ok === false)).toBe(true);
  });
});

describe("RBAC — services", () => {
  it("analyst cannot manage operations, approve data or change settings", async () => {
    const company = (await listCompanies(A.analyst))[0];
    await expect(createOperation(A.analyst, { companyId: company.id, title: "X", bank: "Y", type: "LEASING" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createCompany(A.analyst, { name: "Nuova S.r.l." })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteCompany(A.advisor, company.id)).rejects.toBeInstanceOf(ForbiddenError);
    const task = await createTask(A.analyst, { title: "Analista può creare task", companyId: company.id });
    expect(task.createdById).toBe(A.analyst.userId);
  });

  it("analyst cannot approve extracted financial data", async () => {
    await expect(approveExtraction(B.analyst, bIds.extraction)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
