import { audit } from "@/lib/audit";
import { db, type Prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { toNumber } from "@/lib/financial/fields";
import { OPEN_OPERATION_STATUSES, type OperationStatusKey } from "@/lib/labels";
import { checklistTemplateFor, matchDocumentsToTemplate, missingRequiredItems } from "@/lib/operations/checklist";
import { NotFoundError } from "@/lib/permissions";
import {
  checklistItemCreateSchema,
  checklistItemUpdateSchema,
  checklistTaskSchema,
  operationCreateSchema,
  operationUpdateSchema,
} from "@/lib/validation/schemas";
import { syncAlerts } from "./alerts";
import { assertCompanyInOrg, assertUserInOrg } from "./companies";
import { authorize, type ServiceContext } from "./context";
import { createTask, taskInclude } from "./tasks";

function money<
  T extends {
    amount: Prisma.Decimal | null;
    outstandingDebt: Prisma.Decimal | null;
    rate: Prisma.Decimal | null;
    feeValue: Prisma.Decimal | null;
    feeDiscountValue: Prisma.Decimal | null;
    monthlyRetainer: Prisma.Decimal | null;
    retainerDiscountValue: Prisma.Decimal | null;
  },
>(op: T) {
  return {
    ...op,
    amount: toNumber(op.amount),
    outstandingDebt: toNumber(op.outstandingDebt),
    rate: toNumber(op.rate),
    feeValue: toNumber(op.feeValue),
    feeDiscountValue: toNumber(op.feeDiscountValue),
    monthlyRetainer: toNumber(op.monthlyRetainer),
    retainerDiscountValue: toNumber(op.retainerDiscountValue),
  };
}

export async function listOperations(
  ctx: ServiceContext,
  filters: { status?: string; companyId?: string; q?: string; scope?: "open" | "closed" | "all" } = {},
) {
  authorize(ctx, "operation:read");
  const where: Prisma.FinancingOperationWhereInput = { organizationId: ctx.organizationId };
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.status) where.status = filters.status as OperationStatusKey;
  else if ((filters.scope ?? "all") === "open") where.status = { in: OPEN_OPERATION_STATUSES };
  else if (filters.scope === "closed") where.status = { in: ["COMPLETED", "REJECTED"] };
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { bank: { contains: q, mode: "insensitive" } },
      { company: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  const operations = await db.financingOperation.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      checklist: { select: { id: true, name: true, required: true, status: true, dueDate: true } },
      _count: { select: { tasks: { where: { status: { not: "DONE" } } } } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return operations.map((op) => {
    const required = op.checklist.filter((i) => i.required);
    const missing = missingRequiredItems(op.checklist);
    return {
      ...money(op),
      checklistSummary: {
        total: op.checklist.length,
        required: required.length,
        received: required.length - missing.length,
        missing: missing.map((i) => i.name),
      },
      openTasks: op._count.tasks,
    };
  });
}

export type OperationListItem = Awaited<ReturnType<typeof listOperations>>[number];

export async function getOperation(ctx: ServiceContext, operationId: string) {
  authorize(ctx, "operation:read");
  const op = await db.financingOperation.findFirst({
    where: { id: operationId, organizationId: ctx.organizationId },
    include: {
      company: { select: { id: true, name: true, vatNumber: true, sector: true } },
      owner: { select: { id: true, name: true } },
      checklist: {
        orderBy: { createdAt: "asc" },
        include: {
          document: { select: { id: true, fileName: true, type: true, fiscalYear: true } },
          tasks: { where: { status: { not: "DONE" } }, select: { id: true, title: true, status: true, dueDate: true } },
        },
      },
      tasks: { include: taskInclude, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }] },
    },
  });
  if (!op) throw new NotFoundError("Operazione");
  const timeline = await db.auditLog.findMany({
    where: {
      organizationId: ctx.organizationId,
      OR: [
        { entityType: "FinancingOperation", entityId: operationId },
        { metadata: { path: ["operationId"], equals: operationId } },
      ],
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    ...money(op),
    missingDocuments: missingRequiredItems(op.checklist).map((i) => ({ id: i.id, name: i.name, status: i.status, dueDate: i.dueDate })),
    timeline,
  };
}

export type OperationDetail = Awaited<ReturnType<typeof getOperation>>;

export async function createOperation(ctx: ServiceContext, input: unknown) {
  authorize(ctx, "operation:write");
  const data = operationCreateSchema.parse(input);
  await assertCompanyInOrg(ctx, data.companyId);
  if (data.ownerId) await assertUserInOrg(ctx, data.ownerId);
  const { withChecklist, ...fields } = data;

  const operation = await db.financingOperation.create({
    data: {
      ...fields,
      sourceDetail: fields.source === "ALTRO" ? fields.sourceDetail : null,
      organizationId: ctx.organizationId,
      ownerId: fields.ownerId ?? ctx.userId,
      createdById: ctx.userId,
      closedAt: fields.status === "COMPLETED" || fields.status === "REJECTED" ? new Date() : null,
    },
  });

  let checklistCount = 0;
  if (withChecklist) {
    const template = checklistTemplateFor(data.type);
    const docs = await db.document.findMany({
      where: { organizationId: ctx.organizationId, companyId: data.companyId },
      orderBy: [{ fiscalYear: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: { id: true, type: true, fiscalYear: true },
    });
    const matches = matchDocumentsToTemplate(template, docs);
    const now = new Date();
    const result = await db.financingDocument.createMany({
      data: template.map((item, i) => ({
        organizationId: ctx.organizationId,
        operationId: operation.id,
        name: item.name,
        documentType: item.documentType,
        required: item.required,
        status: matches[i] ? ("RECEIVED" as const) : ("MISSING" as const),
        documentId: matches[i],
        receivedAt: matches[i] ? now : null,
      })),
    });
    checklistCount = result.count;
  }

  await audit(ctx, {
    action: "operation.create",
    entityType: "FinancingOperation",
    entityId: operation.id,
    companyId: operation.companyId,
    metadata: { title: operation.title, bank: operation.bank, type: operation.type, status: operation.status, checklistItems: checklistCount },
  });
  await syncAlerts(ctx.organizationId);
  return money(operation);
}

export async function updateOperation(ctx: ServiceContext, operationId: string, input: unknown) {
  authorize(ctx, "operation:write");
  const existing = await db.financingOperation.findFirst({ where: { id: operationId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Operazione");
  const data = operationUpdateSchema.parse(input);
  if (data.ownerId) await assertUserInOrg(ctx, data.ownerId);
  const statusChanged = data.status !== undefined && data.status !== existing.status;
  const closing = statusChanged && (data.status === "COMPLETED" || data.status === "REJECTED");
  const source = data.source ?? existing.source;
  const operation = await db.financingOperation.update({
    where: { id: operationId },
    data: {
      ...data,
      sourceDetail: source === "ALTRO" ? data.sourceDetail : null,
      closedAt: statusChanged ? (closing ? new Date() : null) : undefined,
    },
  });
  await audit(ctx, {
    action: statusChanged ? "operation.status_change" : "operation.update",
    entityType: "FinancingOperation",
    entityId: operationId,
    companyId: existing.companyId,
    metadata: {
      title: operation.title,
      fields: Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k),
      from: statusChanged ? existing.status : undefined,
      to: statusChanged ? data.status : undefined,
    },
  });
  await syncAlerts(ctx.organizationId);
  return money(operation);
}

export async function deleteOperation(ctx: ServiceContext, operationId: string) {
  authorize(ctx, "operation:write");
  const existing = await db.financingOperation.findFirst({ where: { id: operationId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Operazione");
  await db.financingOperation.delete({ where: { id: operationId } });
  await audit(ctx, {
    action: "operation.delete",
    entityType: "FinancingOperation",
    entityId: operationId,
    companyId: existing.companyId,
    metadata: { title: existing.title },
  });
  await syncAlerts(ctx.organizationId);
  return { ok: true };
}

async function getChecklistItem(ctx: ServiceContext, itemId: string) {
  const item = await db.financingDocument.findFirst({
    where: { id: itemId, organizationId: ctx.organizationId },
    include: { operation: { select: { id: true, title: true, companyId: true, company: { select: { name: true } } } } },
  });
  if (!item) throw new NotFoundError("Voce checklist");
  return item;
}

export async function addChecklistItem(ctx: ServiceContext, operationId: string, input: unknown) {
  authorize(ctx, "operation:write");
  const op = await db.financingOperation.findFirst({ where: { id: operationId, organizationId: ctx.organizationId } });
  if (!op) throw new NotFoundError("Operazione");
  const data = checklistItemCreateSchema.parse(input);
  const item = await db.financingDocument.create({
    data: {
      organizationId: ctx.organizationId,
      operationId,
      name: data.name,
      documentType: data.documentType,
      required: data.required,
      dueDate: data.dueDate ?? null,
      notes: data.notes ?? null,
      status: "REQUESTED",
      requestedAt: new Date(),
    },
  });
  await audit(ctx, {
    action: "checklist.create",
    entityType: "FinancingDocument",
    entityId: item.id,
    companyId: op.companyId,
    metadata: { name: item.name, operationId, dueDate: item.dueDate },
  });
  await syncAlerts(ctx.organizationId);
  return item;
}

export async function updateChecklistItem(ctx: ServiceContext, itemId: string, input: unknown) {
  authorize(ctx, "document:write");
  const item = await getChecklistItem(ctx, itemId);
  const data = checklistItemUpdateSchema.parse(input);
  const now = new Date();
  let status = data.status;
  if (data.documentId) {
    const doc = await db.document.findFirst({
      where: { id: data.documentId, organizationId: ctx.organizationId },
      select: { id: true, companyId: true },
    });
    if (!doc) throw new NotFoundError("Documento");
    if (doc.companyId && doc.companyId !== item.operation.companyId) {
      throw badRequest("Il documento appartiene a un'altra azienda.");
    }
    if (!status && (item.status === "MISSING" || item.status === "REQUESTED")) status = "RECEIVED";
  }
  if (data.required !== undefined) authorize(ctx, "operation:write");
  const updated = await db.financingDocument.update({
    where: { id: itemId },
    data: {
      status,
      required: data.required,
      dueDate: data.dueDate,
      documentId: data.documentId,
      notes: data.notes,
      requestedAt: status === "REQUESTED" && item.status !== "REQUESTED" ? now : undefined,
      receivedAt: (status === "RECEIVED" || status === "VERIFIED") && !item.receivedAt ? now : undefined,
    },
  });
  await audit(ctx, {
    action: "checklist.update",
    entityType: "FinancingDocument",
    entityId: itemId,
    companyId: item.operation.companyId,
    metadata: {
      name: item.name,
      operationId: item.operationId,
      from: status && status !== item.status ? item.status : undefined,
      to: status && status !== item.status ? status : undefined,
      dueDate: data.dueDate,
      documentId: data.documentId,
    },
  });
  await syncAlerts(ctx.organizationId);
  return updated;
}

export async function deleteChecklistItem(ctx: ServiceContext, itemId: string) {
  authorize(ctx, "operation:write");
  const item = await getChecklistItem(ctx, itemId);
  await db.financingDocument.delete({ where: { id: itemId } });
  await audit(ctx, {
    action: "checklist.update",
    entityType: "FinancingDocument",
    entityId: itemId,
    companyId: item.operation.companyId,
    metadata: { name: item.name, operationId: item.operationId, deleted: true },
  });
  await syncAlerts(ctx.organizationId);
  return { ok: true };
}

/** "Assegna task" on a checklist item: creates the follow-up task and marks the document as requested. */
export async function createChecklistTask(ctx: ServiceContext, itemId: string, input: unknown) {
  authorize(ctx, "task:write");
  const item = await getChecklistItem(ctx, itemId);
  const data = checklistTaskSchema.parse(input ?? {});
  const dueDate = data.dueDate ?? item.dueDate;
  const task = await createTask(
    ctx,
    {
      title: `Richiedere "${item.name}" a ${item.operation.company.name}`,
      description: `Documento richiesto per l'operazione "${item.operation.title}".`,
      companyId: item.operation.companyId,
      operationId: item.operationId,
      financingDocumentId: item.id,
      assigneeId: data.assigneeId ?? ctx.userId,
      priority: data.priority,
      dueDate: dueDate ? dueDate.toISOString() : null,
    },
    { source: "CHECKLIST" },
  );
  await db.financingDocument.update({
    where: { id: itemId },
    data: {
      status: item.status === "MISSING" ? "REQUESTED" : undefined,
      requestedAt: item.status === "MISSING" ? new Date() : undefined,
      dueDate: dueDate ?? undefined,
    },
  });
  return task;
}
