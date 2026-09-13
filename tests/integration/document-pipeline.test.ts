import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { extractBilancioByRules } from "@/lib/documents/bilancio-rules";
import { generateBilancioPdf, generateSituazioneContabilePdf, generateVisuraPdf } from "@/lib/documents/demo-pdf";
import { bilancioExtractionSchema } from "@/lib/documents/extraction-schema";
import { extractPdfPages } from "@/lib/documents/pdf-text";
import { statementToValues } from "@/lib/financial/fields";
import { decideApproval } from "@/services/approvals";
import { createCompany } from "@/services/companies";
import { getDocument, uploadDocument } from "@/services/documents";
import { approveExtraction, getFinancialOverview } from "@/services/financials";
import { searchCompanyKnowledge } from "@/services/search";
import { processDocument } from "@/workers/document-processor";
import { SAMPLE_FINANCIALS, createOrgFixture, deleteOrg, uniqueVat } from "./helpers";

let F: Awaited<ReturnType<typeof createOrgFixture>>;
let companyId = "";
let vat = "";

beforeAll(async () => {
  F = await createOrgFixture("Pipeline");
  vat = uniqueVat();
  companyId = (await createCompany(F.advisor, { name: "Pipeline Test S.r.l.", vatNumber: vat, city: "Bologna" })).id;
});

afterAll(async () => {
  await deleteOrg(F.org.id);
});

describe("rules extractor on a real PDF", () => {
  it("extracts schema-valid data matching the document", async () => {
    const f = SAMPLE_FINANCIALS[2025];
    const bytes = await generateBilancioPdf({ companyName: "Pipeline Test S.r.l.", vatNumber: vat, city: "Bologna", fiscalYear: 2025, current: f, previous: SAMPLE_FINANCIALS[2024] });
    const { pages, pageCount } = await extractPdfPages(bytes);
    expect(pageCount).toBeGreaterThanOrEqual(2);
    const e = extractBilancioByRules(pages);
    expect(bilancioExtractionSchema.safeParse(e).success).toBe(true);
    expect(e.fiscal_year).toBe(2025);
    expect(e.tax_id).toBe(vat);
    expect(e.fields.revenue.value).toBe(f.revenue);
    expect(e.fields.ebit.value).toBe(f.ebit);
    expect(e.fields.depreciation.value).toBe(f.depreciation);
    expect(e.fields.ebitda.value).toBe(f.ebit + f.depreciation);
    expect(e.fields.net_income.value).toBe(f.netIncome);
    expect(e.fields.cash.value).toBe(f.cash);
    expect(e.fields.financial_debt.value).toBe(f.financialDebt);
    expect(e.fields.equity.value).toBe(f.equity);
    expect(e.fields.current_assets.value).toBe(f.currentAssets);
    expect(e.fields.current_liabilities.value).toBe(f.currentLiabilities);
    expect(e.fields.inventory.value).toBe(f.inventory);
    expect(e.fields.total_assets.value).toBe(f.totalAssets);
    expect(e.fields.interest_expense.value).toBe(f.interestExpense);
    expect(e.fields.principal_repayment.value).toBe(f.principalRepayment);
    expect(e.fields.revenue.page).toBe(2);
  });
});

describe("document pipeline end-to-end (rules mode)", () => {
  let extractionId = "";

  it("upload → process → statement created as EXTRACTED with sources and metrics", async () => {
    const bytes = await generateBilancioPdf({ companyName: "Pipeline Test S.r.l.", vatNumber: vat, city: "Bologna", fiscalYear: 2025, current: SAMPLE_FINANCIALS[2025] });
    const { document } = await uploadDocument(F.analyst, { fileName: "Bilancio 2025.pdf", bytes });
    expect(document.companyId).toBeNull();

    const result = await processDocument(F.analyst, document.id);
    expect(result.status).toBe("PROCESSED");
    expect(result.log.map((s) => s.step)).toEqual([
      "EXTRACT_TEXT", "CLASSIFY", "EXTRACT_DATA", "VALIDATE", "SAVE", "UPDATE_COMPANY", "METRICS", "ALERTS", "INSIGHTS",
    ]);
    expect(result.appliedAction).toBe("CREATED_STATEMENT");
    extractionId = result.extractionId!;

    const doc = await getDocument(F.analyst, document.id);
    expect(doc.type).toBe("BILANCIO");
    expect(doc.typeSource).toBe("RULES");
    expect(doc.companyId).toBe(companyId); // matched by VAT number
    expect(doc.fiscalYear).toBe(2025);

    const statement = await db.financialStatement.findFirstOrThrow({ where: { companyId, fiscalYear: 2025 } });
    expect(statement.status).toBe("EXTRACTED");
    expect(statementToValues(statement).revenue).toBe(SAMPLE_FINANCIALS[2025].revenue);
    const sources = statement.fieldSources as Record<string, { documentId: string; page: number; method: string }>;
    expect(sources.revenue.documentId).toBe(document.id);
    expect(sources.revenue.page).toBe(2);
    expect(sources.revenue.method).toBe("RULES");
    expect(await db.financialMetric.count({ where: { financialStatementId: statement.id } })).toBe(10);

    const hits = await searchCompanyKnowledge(F.analyst, companyId, "ricavi delle vendite");
    expect(hits[0]?.documentId).toBe(document.id);
  });

  it("analyst cannot approve; advisor approves with an edit (audited as manual)", async () => {
    await expect(approveExtraction(F.analyst, extractionId)).rejects.toThrow();
    await approveExtraction(F.advisor, extractionId, { values: { principalRepayment: 700_000 }, notes: "Verificato su nota integrativa" });
    const overview = await getFinancialOverview(F.advisor, companyId);
    expect(overview.latest?.status).toBe("VERIFIED");
    expect(overview.latest?.values.principalRepayment).toBe(700_000);
    expect(overview.latest?.fieldSources.principalRepayment.method).toBe("MANUAL");
    const dscr = overview.latest?.ratios.find((r) => r.key === "dscr");
    expect(dscr?.value).toBeCloseTo(1_350_000 / 960_000, 5);
    const log = await db.auditLog.findFirst({ where: { organizationId: F.org.id, action: "extraction.approve" } });
    expect((log?.metadata as { editedFields: string[] }).editedFields).toEqual(["principalRepayment"]);
  });

  it("a new document for a verified year becomes an approval request, not an overwrite", async () => {
    const changed = { ...SAMPLE_FINANCIALS[2025], revenue: 12_000_000 };
    const bytes = await generateBilancioPdf({ companyName: "Pipeline Test S.r.l.", vatNumber: vat, city: "Bologna", fiscalYear: 2025, current: changed });
    const { document } = await uploadDocument(F.advisor, { fileName: "Bilancio 2025 rettificato.pdf", bytes, companyId });
    const result = await processDocument(F.advisor, document.id);
    expect(result.appliedAction).toBe("PROPOSED_UPDATE");

    const statement = await db.financialStatement.findFirstOrThrow({ where: { companyId, fiscalYear: 2025 } });
    expect(statementToValues(statement).revenue).toBe(SAMPLE_FINANCIALS[2025].revenue);

    const approval = await db.approvalRequest.findFirstOrThrow({ where: { organizationId: F.org.id, type: "UPDATE_FINANCIAL_STATEMENT", status: "PENDING" } });
    const payload = approval.payload as { changes: { field: string; proposed: number }[] };
    expect(payload.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "revenue", proposed: 12_000_000 })]));

    await decideApproval(F.advisor, approval.id, "REJECT", "Documento non definitivo");
    const after = await db.financialStatement.findFirstOrThrow({ where: { companyId, fiscalYear: 2025 } });
    expect(statementToValues(after).revenue).toBe(SAMPLE_FINANCIALS[2025].revenue);
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: approval.id } })).status).toBe("REJECTED");
  });

  it("non-financial documents are classified without structured extraction", async () => {
    const bytes = await generateVisuraPdf({ companyName: "Pipeline Test S.r.l.", vatNumber: vat, city: "Bologna", reaNumber: "BO-1", ateco: "62.01", sector: "Software", foundedYear: 2010, legalRepresentative: "Mario Demo" });
    const { document } = await uploadDocument(F.advisor, { fileName: "visura.pdf", bytes, companyId });
    const result = await processDocument(F.advisor, document.id);
    expect(result.status).toBe("PROCESSED");
    expect(result.extractionId).toBeNull();
    expect(result.log.find((s) => s.step === "EXTRACT_DATA")?.status).toBe("skipped");
    expect((await getDocument(F.advisor, document.id)).type).toBe("VISURA");
  });

  it("interim reports are extracted and reviewed but never create an annual statement", async () => {
    const bytes = await generateSituazioneContabilePdf({ companyName: "Pipeline Test S.r.l.", vatNumber: vat, city: "Bologna", date: "30/06/2026", revenue: 5_900_000, ebit: 410_000, cash: 700_000, bankDebt: 5_000_000 });
    const { document } = await uploadDocument(F.advisor, { fileName: "situazione.pdf", bytes, companyId });
    const result = await processDocument(F.advisor, document.id);
    expect(result.status).toBe("PROCESSED");
    expect((await getDocument(F.advisor, document.id)).type).toBe("SITUAZIONE_CONTABILE");
    expect(result.log.find((s) => s.step === "UPDATE_COMPANY")?.status).toBe("skipped");
    expect(result.extractionId).not.toBeNull();

    const before = await db.financialStatement.count({ where: { companyId } });
    await approveExtraction(F.advisor, result.extractionId!);
    expect(await db.financialStatement.count({ where: { companyId } })).toBe(before);
    expect(await db.financialStatement.count({ where: { companyId, fiscalYear: 2026 } })).toBe(0);
    expect((await db.documentExtraction.findUniqueOrThrow({ where: { id: result.extractionId! } })).status).toBe("APPROVED");
  });

  it("rejects non-PDF uploads", async () => {
    await expect(uploadDocument(F.advisor, { fileName: "note.pdf", bytes: new TextEncoder().encode("ciao"), companyId })).rejects.toThrow(/PDF/);
  });
});
