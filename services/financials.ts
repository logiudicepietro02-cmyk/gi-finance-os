import { audit } from "@/lib/audit";
import { db, toJson, type Prisma } from "@/lib/db";
import {
  EXTRACTION_TO_STATEMENT,
  type BilancioExtraction,
  type BilancioFieldKey,
} from "@/lib/documents/extraction-schema";
import { badRequest, conflict } from "@/lib/errors";
import {
  FIELD_LABELS,
  STATEMENT_FIELDS,
  statementToValues,
  type StatementField,
  type StatementValues,
} from "@/lib/financial/fields";
import { computeRatios } from "@/lib/financial/ratios";
import { computeVariations, significantChanges } from "@/lib/financial/variations";
import { NotFoundError } from "@/lib/permissions";
import {
  extractionApproveSchema,
  extractionRejectSchema,
  statementCreateSchema,
  statementUpdateSchema,
} from "@/lib/validation/schemas";
import { syncAlerts } from "./alerts";
import { assertCompanyInOrg } from "./companies";
import { allowed, authorize, type ServiceContext } from "./context";
import { refreshVariationInsights } from "./insights";

export interface FieldSource {
  method: "AI" | "RULES" | "MANUAL" | "SEED" | "COMPUTED";
  documentId?: string | null;
  extractionId?: string | null;
  page?: number | null;
  sourceText?: string | null;
  confidence?: number | null;
  userId?: string;
  at?: string;
  formula?: string;
}

type Actor = { organizationId: string; userId?: string | null };
type ValuesData = Partial<Record<StatementField, number | null>>;

const isNil = (v: unknown): v is null | undefined => v === null || v === undefined;

function valuesToData(values: StatementValues, { skipNull }: { skipNull: boolean }): ValuesData {
  const data: ValuesData = {};
  for (const field of STATEMENT_FIELDS) {
    const v = values[field];
    if (v === undefined || (skipNull && v === null)) continue;
    data[field] = v;
  }
  return data;
}

const statementInclude = { sourceDocument: { select: { id: true, fileName: true } } } satisfies Prisma.FinancialStatementInclude;
type StatementWithDocument = Prisma.FinancialStatementGetPayload<{ include: typeof statementInclude }>;

function serializeStatement(s: StatementWithDocument) {
  const values = statementToValues(s);
  return {
    id: s.id,
    companyId: s.companyId,
    fiscalYear: s.fiscalYear,
    periodEnd: s.periodEnd,
    type: s.type,
    status: s.status,
    currency: s.currency,
    notes: s.notes,
    sourceDocument: s.sourceDocument,
    fieldSources: (s.fieldSources ?? {}) as unknown as Record<string, FieldSource>,
    verifiedAt: s.verifiedAt,
    updatedAt: s.updatedAt,
    values,
    ratios: computeRatios(values),
  };
}

export type SerializedStatement = ReturnType<typeof serializeStatement>;

/** Maps a validated extraction to statement values, keeping the source of every field. */
export function extractionToValues(
  data: BilancioExtraction,
  meta: { documentId: string; extractionId: string; method: FieldSource["method"] },
) {
  const values: StatementValues = {};
  const sources: Record<string, FieldSource> = {};
  for (const key of Object.keys(data.fields) as BilancioFieldKey[]) {
    const target = EXTRACTION_TO_STATEMENT[key];
    const field = data.fields[key];
    if (!target || field.value === null) continue;
    values[target] = field.value;
    sources[target] = {
      method: meta.method,
      documentId: meta.documentId,
      extractionId: meta.extractionId,
      page: field.page,
      sourceText: field.sourceText,
      confidence: field.confidence,
    };
  }
  if (isNil(values.netFinancialPosition) && !isNil(values.financialDebt) && !isNil(values.cash)) {
    values.netFinancialPosition = Math.round((values.financialDebt - values.cash) * 100) / 100;
    sources.netFinancialPosition = {
      method: "COMPUTED",
      formula: "Debiti finanziari − Disponibilità liquide",
      documentId: meta.documentId,
      extractionId: meta.extractionId,
    };
  }
  return { values, sources };
}

export async function recomputeMetrics(organizationId: string, statementId: string) {
  const statement = await db.financialStatement.findFirst({ where: { id: statementId, organizationId } });
  if (!statement) return [];
  const ratios = computeRatios(statementToValues(statement));
  await db.$transaction([
    db.financialMetric.deleteMany({ where: { financialStatementId: statement.id } }),
    db.financialMetric.createMany({
      data: ratios.map((r) => ({
        organizationId,
        companyId: statement.companyId,
        financialStatementId: statement.id,
        fiscalYear: statement.fiscalYear,
        key: r.key,
        value: r.value,
        status: r.status,
        formula: r.formula,
        inputs: toJson(r.inputs) as Prisma.InputJsonValue,
      })),
    }),
  ]);
  return ratios;
}

export async function listStatements(ctx: ServiceContext, companyId: string) {
  authorize(ctx, "company:read");
  await assertCompanyInOrg(ctx, companyId);
  const statements = await db.financialStatement.findMany({
    where: { organizationId: ctx.organizationId, companyId, type: "ANNUAL" },
    orderBy: { fiscalYear: "asc" },
    include: statementInclude,
  });
  return statements.map(serializeStatement);
}

export async function getFinancialOverview(ctx: ServiceContext, companyId: string) {
  const statements = await listStatements(ctx, companyId);
  const latest = statements.at(-1) ?? null;
  const previous = statements.length > 1 ? statements[statements.length - 2] : null;
  const variations =
    latest && previous
      ? computeVariations(latest.values, previous.values, { current: latest.ratios, previous: previous.ratios })
      : [];
  const trend = statements.slice(-5).map((s) => {
    const r = Object.fromEntries(s.ratios.map((x) => [x.key, x.value]));
    return {
      year: s.fiscalYear,
      status: s.status,
      revenue: s.values.revenue ?? null,
      ebitda: s.values.ebitda ?? null,
      ebit: s.values.ebit ?? null,
      netIncome: s.values.netIncome ?? null,
      equity: s.values.equity ?? null,
      netDebt: r.net_debt ?? null,
      ebitdaMargin: r.ebitda_margin ?? null,
      netDebtToEbitda: r.net_debt_to_ebitda ?? null,
      dscr: r.dscr ?? null,
    };
  });
  const pendingExtractions = await db.documentExtraction.findMany({
    where: { organizationId: ctx.organizationId, companyId, status: "PENDING_REVIEW", documentType: "BILANCIO" },
    select: { id: true, fiscalYear: true, documentId: true, method: true, appliedAction: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    statements,
    latest,
    previous,
    variations,
    changes: significantChanges(variations),
    trend,
    pendingExtractions,
  };
}

export type FinancialOverview = Awaited<ReturnType<typeof getFinancialOverview>>;

/**
 * Applies a freshly extracted statement to the company, honoring AI governance:
 * - no statement for that year → create it as EXTRACTED (visible, flagged "da verificare")
 * - unverified statement from the same document (re-processing) → update it
 * - anything else (verified data, or data from another document) → ApprovalRequest, no overwrite
 */
export async function applyExtraction(
  actor: Actor,
  params: {
    extractionId: string;
    documentId: string;
    companyId: string;
    fiscalYear: number;
    data: BilancioExtraction;
    method: FieldSource["method"];
  },
) {
  const { organizationId } = actor;
  const { values, sources } = extractionToValues(params.data, params);
  const existing = await db.financialStatement.findUnique({
    where: { companyId_fiscalYear_type: { companyId: params.companyId, fiscalYear: params.fiscalYear, type: "ANNUAL" } },
  });

  if (!existing) {
    const statement = await db.financialStatement.create({
      data: {
        organizationId,
        companyId: params.companyId,
        fiscalYear: params.fiscalYear,
        periodEnd: params.data.period_end ? new Date(`${params.data.period_end}T00:00:00Z`) : null,
        status: "EXTRACTED",
        sourceDocumentId: params.documentId,
        ...valuesToData(values, { skipNull: false }),
        fieldSources: toJson(sources) as Prisma.InputJsonValue,
      },
    });
    await recomputeMetrics(organizationId, statement.id);
    await db.documentExtraction.update({
      where: { id: params.extractionId },
      data: { financialStatementId: statement.id, appliedAction: "CREATED_STATEMENT" },
    });
    await audit(actor, {
      action: "statement.create",
      entityType: "FinancialStatement",
      entityId: statement.id,
      companyId: params.companyId,
      actorType: "SYSTEM",
      metadata: { fiscalYear: params.fiscalYear, extractionId: params.extractionId, method: params.method },
    });
    return { appliedAction: "CREATED_STATEMENT" as const, statementId: statement.id, approvalId: null };
  }

  if (existing.status === "EXTRACTED" && existing.sourceDocumentId === params.documentId) {
    await db.financialStatement.update({
      where: { id: existing.id },
      data: {
        ...valuesToData(values, { skipNull: true }),
        fieldSources: toJson({ ...((existing.fieldSources as object | null) ?? {}), ...sources }) as Prisma.InputJsonValue,
      },
    });
    await recomputeMetrics(organizationId, existing.id);
    await db.documentExtraction.update({
      where: { id: params.extractionId },
      data: { financialStatementId: existing.id, appliedAction: "UPDATED_UNVERIFIED" },
    });
    await audit(actor, {
      action: "statement.update",
      entityType: "FinancialStatement",
      entityId: existing.id,
      companyId: params.companyId,
      actorType: "SYSTEM",
      metadata: { fiscalYear: params.fiscalYear, extractionId: params.extractionId, reason: "rielaborazione documento" },
    });
    return { appliedAction: "UPDATED_UNVERIFIED" as const, statementId: existing.id, approvalId: null };
  }

  const current = statementToValues(existing);
  const changes = STATEMENT_FIELDS.filter((f) => {
    const proposed = values[f];
    if (isNil(proposed)) return false;
    const cur = current[f];
    return isNil(cur) || Math.abs(cur - proposed) > Math.max(1, Math.abs(cur) * 0.001);
  }).map((f) => ({ field: f, label: FIELD_LABELS[f], current: current[f] ?? null, proposed: values[f] ?? null }));

  if (changes.length === 0) {
    await db.documentExtraction.update({
      where: { id: params.extractionId },
      data: {
        financialStatementId: existing.id,
        appliedAction: "NONE",
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewNotes: "Dati coincidenti con il bilancio già presente.",
      },
    });
    return { appliedAction: "NONE" as const, statementId: existing.id, approvalId: null };
  }

  const approval = await db.approvalRequest.create({
    data: {
      organizationId,
      companyId: params.companyId,
      type: "UPDATE_FINANCIAL_STATEMENT",
      title: `Aggiornare il bilancio ${params.fiscalYear} con i dati estratti`,
      reason:
        existing.status === "VERIFIED"
          ? "Il bilancio è già verificato: la modifica dei dati richiede approvazione."
          : "Esiste già un bilancio per lo stesso esercizio proveniente da un altro documento.",
      payload: toJson({ statementId: existing.id, fiscalYear: params.fiscalYear, documentId: params.documentId, changes }) as Prisma.InputJsonValue,
      documentExtractionId: params.extractionId,
      requestedByUserId: actor.userId ?? null,
    },
  });
  await db.documentExtraction.update({
    where: { id: params.extractionId },
    data: { financialStatementId: existing.id, appliedAction: "PROPOSED_UPDATE" },
  });
  await audit(actor, {
    action: "approval.request",
    entityType: "ApprovalRequest",
    entityId: approval.id,
    companyId: params.companyId,
    actorType: "SYSTEM",
    metadata: { type: approval.type, fiscalYear: params.fiscalYear, changes: changes.length },
  });
  return { appliedAction: "PROPOSED_UPDATE" as const, statementId: existing.id, approvalId: approval.id };
}

export async function getExtraction(ctx: ServiceContext, extractionId: string) {
  authorize(ctx, "document:read");
  const extraction = await db.documentExtraction.findFirst({
    where: { id: extractionId, organizationId: ctx.organizationId },
    include: {
      document: { select: { id: true, fileName: true, companyId: true, company: { select: { id: true, name: true } } } },
      approvals: true,
    },
  });
  if (!extraction) throw new NotFoundError("Estrazione");
  return extraction;
}

export async function approveExtraction(ctx: ServiceContext, extractionId: string, rawInput: unknown = {}) {
  authorize(ctx, "financials:approve");
  const input = extractionApproveSchema.parse(rawInput ?? {});
  const ex = await db.documentExtraction.findFirst({
    where: { id: extractionId, organizationId: ctx.organizationId },
    include: { document: { select: { id: true, companyId: true, fiscalYear: true } } },
  });
  if (!ex) throw new NotFoundError("Estrazione");
  if (ex.status !== "PENDING_REVIEW") throw conflict("Estrazione già revisionata.");
  const companyId = ex.companyId ?? ex.document.companyId;
  if (!companyId) throw badRequest("Associa il documento a un'azienda prima di approvare i dati.");

  // Interim reports (situazione contabile) are reviewed but never applied to the annual statement.
  if (ex.documentType !== "BILANCIO") {
    await db.documentExtraction.update({
      where: { id: ex.id },
      data: { status: "APPROVED", reviewedById: ctx.userId, reviewedAt: new Date(), reviewNotes: input.notes ?? null, companyId },
    });
    await audit(ctx, {
      action: "extraction.approve",
      entityType: "DocumentExtraction",
      entityId: ex.id,
      companyId,
      metadata: { interim: true, documentType: ex.documentType, documentId: ex.documentId },
    });
    return { statementId: null };
  }

  const data = ex.data as unknown as BilancioExtraction;
  const fiscalYear = input.fiscalYear ?? ex.fiscalYear ?? data.fiscal_year ?? ex.document.fiscalYear;
  if (!fiscalYear) throw badRequest("Esercizio non individuato: indicalo prima di approvare.");

  const now = new Date();
  const { values, sources } = extractionToValues(data, { documentId: ex.documentId, extractionId: ex.id, method: ex.method });
  const edited: StatementField[] = [];
  for (const field of STATEMENT_FIELDS) {
    const v = input.values?.[field];
    if (v === undefined) continue;
    if (v !== (values[field] ?? null)) {
      edited.push(field);
      values[field] = v;
      sources[field] = { method: "MANUAL", userId: ctx.userId, at: now.toISOString(), documentId: ex.documentId, extractionId: ex.id };
    }
  }

  const existing = await db.financialStatement.findUnique({
    where: { companyId_fiscalYear_type: { companyId, fiscalYear, type: "ANNUAL" } },
  });
  let statementId: string;
  if (existing) {
    const valueData = valuesToData(values, { skipNull: true });
    for (const field of edited) valueData[field] = values[field] ?? null; // explicit clears by the reviewer
    const updated = await db.financialStatement.update({
      where: { id: existing.id },
      data: {
        ...valueData,
        fieldSources: toJson({ ...((existing.fieldSources as object | null) ?? {}), ...sources }) as Prisma.InputJsonValue,
        status: "VERIFIED",
        verifiedById: ctx.userId,
        verifiedAt: now,
        sourceDocumentId: existing.sourceDocumentId ?? ex.documentId,
      },
    });
    statementId = updated.id;
  } else {
    const created = await db.financialStatement.create({
      data: {
        organizationId: ctx.organizationId,
        companyId,
        fiscalYear,
        periodEnd: data.period_end ? new Date(`${data.period_end}T00:00:00Z`) : null,
        ...valuesToData(values, { skipNull: false }),
        fieldSources: toJson(sources) as Prisma.InputJsonValue,
        status: "VERIFIED",
        verifiedById: ctx.userId,
        verifiedAt: now,
        sourceDocumentId: ex.documentId,
      },
    });
    statementId = created.id;
  }

  await recomputeMetrics(ctx.organizationId, statementId);
  await db.documentExtraction.update({
    where: { id: ex.id },
    data: {
      status: "APPROVED",
      reviewedById: ctx.userId,
      reviewedAt: now,
      reviewNotes: input.notes ?? null,
      financialStatementId: statementId,
      fiscalYear,
      companyId,
    },
  });
  await db.approvalRequest.updateMany({
    where: { organizationId: ctx.organizationId, documentExtractionId: ex.id, status: "PENDING" },
    data: { status: "APPROVED", decidedById: ctx.userId, decidedAt: now, resultEntityId: statementId },
  });
  await audit(ctx, {
    action: "extraction.approve",
    entityType: "DocumentExtraction",
    entityId: ex.id,
    companyId,
    metadata: { fiscalYear, statementId, editedFields: edited, documentId: ex.documentId },
  });
  await audit(ctx, { action: "statement.verify", entityType: "FinancialStatement", entityId: statementId, companyId, metadata: { fiscalYear } });
  await syncAlerts(ctx.organizationId);
  await refreshVariationInsights(ctx.organizationId, companyId);
  return { statementId };
}

export async function rejectExtraction(ctx: ServiceContext, extractionId: string, rawInput: unknown = {}) {
  authorize(ctx, "financials:approve");
  const input = extractionRejectSchema.parse(rawInput ?? {});
  const ex = await db.documentExtraction.findFirst({ where: { id: extractionId, organizationId: ctx.organizationId } });
  if (!ex) throw new NotFoundError("Estrazione");
  if (ex.status !== "PENDING_REVIEW") throw conflict("Estrazione già revisionata.");
  const now = new Date();
  let removedStatement = false;
  if (ex.financialStatementId && (ex.appliedAction === "CREATED_STATEMENT" || ex.appliedAction === "UPDATED_UNVERIFIED")) {
    const statement = await db.financialStatement.findFirst({
      where: { id: ex.financialStatementId, organizationId: ctx.organizationId },
    });
    if (statement && statement.status === "EXTRACTED" && statement.sourceDocumentId === ex.documentId) {
      await db.financialStatement.delete({ where: { id: statement.id } });
      removedStatement = true;
    }
  }
  await db.documentExtraction.update({
    where: { id: ex.id },
    data: { status: "REJECTED", reviewedById: ctx.userId, reviewedAt: now, reviewNotes: input.notes ?? null },
  });
  await db.approvalRequest.updateMany({
    where: { organizationId: ctx.organizationId, documentExtractionId: ex.id, status: "PENDING" },
    data: { status: "REJECTED", decidedById: ctx.userId, decidedAt: now },
  });
  await audit(ctx, {
    action: "extraction.reject",
    entityType: "DocumentExtraction",
    entityId: ex.id,
    companyId: ex.companyId,
    metadata: { removedUnverifiedStatement: removedStatement, notes: input.notes ?? null },
  });
  await syncAlerts(ctx.organizationId);
  if (ex.companyId) await refreshVariationInsights(ctx.organizationId, ex.companyId);
  return { ok: true, removedStatement };
}

export async function createStatement(ctx: ServiceContext, companyId: string, rawInput: unknown) {
  authorize(ctx, "financials:write");
  await assertCompanyInOrg(ctx, companyId);
  const input = statementCreateSchema.parse(rawInput);
  const exists = await db.financialStatement.findUnique({
    where: { companyId_fiscalYear_type: { companyId, fiscalYear: input.fiscalYear, type: "ANNUAL" } },
  });
  if (exists) throw conflict(`Esiste già un bilancio ${input.fiscalYear} per questa azienda.`);
  const values = input.values as StatementValues;
  const now = new Date().toISOString();
  const sources = Object.fromEntries(
    STATEMENT_FIELDS.filter((f) => !isNil(values[f])).map((f) => [f, { method: "MANUAL", userId: ctx.userId, at: now } satisfies FieldSource]),
  );
  const verified = allowed(ctx, "financials:approve");
  const statement = await db.financialStatement.create({
    data: {
      organizationId: ctx.organizationId,
      companyId,
      fiscalYear: input.fiscalYear,
      periodEnd: new Date(`${input.fiscalYear}-12-31T00:00:00Z`),
      ...valuesToData(values, { skipNull: false }),
      fieldSources: toJson(sources) as Prisma.InputJsonValue,
      status: verified ? "VERIFIED" : "EXTRACTED",
      verifiedById: verified ? ctx.userId : null,
      verifiedAt: verified ? new Date() : null,
      notes: input.notes ?? null,
    },
  });
  await recomputeMetrics(ctx.organizationId, statement.id);
  await audit(ctx, {
    action: "statement.create",
    entityType: "FinancialStatement",
    entityId: statement.id,
    companyId,
    metadata: { fiscalYear: input.fiscalYear, manual: true },
  });
  await syncAlerts(ctx.organizationId);
  await refreshVariationInsights(ctx.organizationId, companyId);
  return statement;
}

export async function updateStatement(ctx: ServiceContext, statementId: string, rawInput: unknown) {
  authorize(ctx, "financials:write");
  const existing = await db.financialStatement.findFirst({ where: { id: statementId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Bilancio");
  if (existing.status === "VERIFIED") authorize(ctx, "financials:approve");
  const input = statementUpdateSchema.parse(rawInput);
  const current = statementToValues(existing);
  const now = new Date().toISOString();
  const data: ValuesData = {};
  const sources: Record<string, FieldSource> = {};
  const changes: { field: StatementField; from: number | null; to: number | null }[] = [];
  for (const field of STATEMENT_FIELDS) {
    const v = input.values[field];
    if (v === undefined) continue;
    const from = current[field] ?? null;
    if (v === from) continue;
    data[field] = v;
    sources[field] = { method: "MANUAL", userId: ctx.userId, at: now };
    changes.push({ field, from, to: v });
  }
  if (changes.length === 0 && input.notes === undefined) return existing;
  const updated = await db.financialStatement.update({
    where: { id: statementId },
    data: {
      ...data,
      notes: input.notes,
      fieldSources: toJson({ ...((existing.fieldSources as object | null) ?? {}), ...sources }) as Prisma.InputJsonValue,
    },
  });
  await recomputeMetrics(ctx.organizationId, statementId);
  await audit(ctx, {
    action: "statement.update",
    entityType: "FinancialStatement",
    entityId: statementId,
    companyId: existing.companyId,
    metadata: { fiscalYear: existing.fiscalYear, changes },
  });
  await syncAlerts(ctx.organizationId);
  await refreshVariationInsights(ctx.organizationId, existing.companyId);
  return updated;
}

export async function verifyStatement(ctx: ServiceContext, statementId: string) {
  authorize(ctx, "financials:approve");
  const existing = await db.financialStatement.findFirst({ where: { id: statementId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Bilancio");
  const updated = await db.financialStatement.update({
    where: { id: statementId },
    data: { status: "VERIFIED", verifiedById: ctx.userId, verifiedAt: new Date() },
  });
  await audit(ctx, {
    action: "statement.verify",
    entityType: "FinancialStatement",
    entityId: statementId,
    companyId: existing.companyId,
    metadata: { fiscalYear: existing.fiscalYear },
  });
  return updated;
}
