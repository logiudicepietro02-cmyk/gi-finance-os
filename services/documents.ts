import crypto from "node:crypto";
import { audit } from "@/lib/audit";
import { db, type Prisma } from "@/lib/db";
import { isPdf } from "@/lib/documents/pdf-text";
import { isDocumentType, type DocumentTypeKey } from "@/lib/documents/types";
import { badRequest, payloadTooLarge } from "@/lib/errors";
import { NotFoundError } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";
import { documentUpdateSchema } from "@/lib/validation/schemas";
import { syncAlerts } from "./alerts";
import { assertCompanyInOrg } from "./companies";
import { authorize, type ServiceContext } from "./context";

export function maxUploadBytes(): number {
  return Math.max(1, Number(process.env.MAX_UPLOAD_MB ?? 25)) * 1024 * 1024;
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "documento.pdf";
  const cleaned = base.replace(/[^\p{L}\p{N}._\-() ]/gu, "_").replace(/\s+/g, " ").trim().slice(0, 150);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "documento"}.pdf`;
}

const listSelect = {
  id: true,
  fileName: true,
  type: true,
  typeSource: true,
  classificationConfidence: true,
  fiscalYear: true,
  status: true,
  pageCount: true,
  sizeBytes: true,
  createdAt: true,
  processedAt: true,
  errorMessage: true,
  description: true,
  companyId: true,
  company: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, name: true } },
  extractions: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, status: true, method: true, appliedAction: true, fiscalYear: true },
  },
} satisfies Prisma.DocumentSelect;

export async function listDocuments(
  ctx: ServiceContext,
  filters: { companyId?: string; type?: string; status?: string; q?: string; review?: boolean; limit?: number } = {},
) {
  authorize(ctx, "document:read");
  const where: Prisma.DocumentWhereInput = { organizationId: ctx.organizationId };
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.type && isDocumentType(filters.type)) where.type = filters.type;
  if (filters.status && ["UPLOADED", "PROCESSING", "PROCESSED", "FAILED"].includes(filters.status)) {
    where.status = filters.status as Prisma.DocumentWhereInput["status"];
  }
  if (filters.q?.trim()) where.fileName = { contains: filters.q.trim(), mode: "insensitive" };
  if (filters.review) {
    where.OR = [
      { status: { in: ["UPLOADED", "FAILED"] } },
      { extractions: { some: { status: "PENDING_REVIEW" } } },
      { companyId: null },
    ];
  }
  return db.document.findMany({ where, select: listSelect, orderBy: { createdAt: "desc" }, take: filters.limit ?? 200 });
}

export type DocumentListItem = Awaited<ReturnType<typeof listDocuments>>[number];

export async function getDocument(ctx: ServiceContext, documentId: string) {
  authorize(ctx, "document:read");
  const document = await db.document.findFirst({
    where: { id: documentId, organizationId: ctx.organizationId },
    omit: { extractedText: true },
    include: {
      company: { select: { id: true, name: true } },
      uploadedBy: { select: { id: true, name: true } },
      extractions: {
        orderBy: { createdAt: "desc" },
        include: { approvals: { select: { id: true, status: true, title: true, payload: true } } },
      },
      financingDocuments: { include: { operation: { select: { id: true, title: true } } } },
      _count: { select: { chunks: true } },
    },
  });
  if (!document) throw new NotFoundError("Documento");
  return document;
}

export type DocumentDetail = Awaited<ReturnType<typeof getDocument>>;

export async function uploadDocument(
  ctx: ServiceContext,
  params: {
    fileName: string;
    bytes: Uint8Array;
    companyId?: string | null;
    type?: string | null;
    fiscalYear?: number | null;
    description?: string | null;
    checklistItemId?: string | null;
  },
) {
  authorize(ctx, "document:write");
  if (params.bytes.byteLength === 0) throw badRequest("Il file è vuoto.");
  if (params.bytes.byteLength > maxUploadBytes()) {
    throw payloadTooLarge(`File troppo grande: massimo ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`);
  }
  if (!isPdf(params.bytes)) throw badRequest("Sono supportati solo file PDF.");

  let companyId = params.companyId || null;
  if (companyId) await assertCompanyInOrg(ctx, companyId);

  let checklistItem: { id: string; operationId: string; documentType: DocumentTypeKey; operation: { companyId: string } } | null = null;
  if (params.checklistItemId) {
    checklistItem = await db.financingDocument.findFirst({
      where: { id: params.checklistItemId, organizationId: ctx.organizationId },
      select: { id: true, operationId: true, documentType: true, operation: { select: { companyId: true } } },
    });
    if (!checklistItem) throw new NotFoundError("Voce checklist");
    companyId ??= checklistItem.operation.companyId;
  }

  const userType = isDocumentType(params.type) ? params.type : null;
  const type: DocumentTypeKey = userType ?? checklistItem?.documentType ?? "ALTRO";
  const typeSource = userType || checklistItem ? ("USER" as const) : null;
  const checksum = crypto.createHash("sha256").update(params.bytes).digest("hex");
  const storageKey = `${ctx.organizationId}/${new Date().getFullYear()}/${crypto.randomUUID()}.pdf`;
  const fileName = sanitizeFileName(params.fileName);

  await getStorage().put(storageKey, params.bytes, "application/pdf");
  const duplicate = await db.document.findFirst({
    where: { organizationId: ctx.organizationId, checksum, companyId },
    select: { id: true, fileName: true },
  });

  const document = await db.document.create({
    data: {
      organizationId: ctx.organizationId,
      companyId,
      uploadedById: ctx.userId,
      fileName,
      mimeType: "application/pdf",
      sizeBytes: params.bytes.byteLength,
      storageKey,
      checksum,
      type,
      typeSource,
      classificationConfidence: typeSource ? 1 : null,
      fiscalYear: params.fiscalYear ?? null,
      description: params.description ?? null,
      status: "UPLOADED",
    },
    select: listSelect,
  });

  if (checklistItem) {
    await db.financingDocument.update({
      where: { id: checklistItem.id },
      data: { documentId: document.id, status: "RECEIVED", receivedAt: new Date() },
    });
  }

  await audit(ctx, {
    action: "document.upload",
    entityType: "Document",
    entityId: document.id,
    companyId,
    metadata: {
      fileName,
      sizeBytes: params.bytes.byteLength,
      type,
      checklistItemId: checklistItem?.id,
      operationId: checklistItem?.operationId,
      duplicateOf: duplicate?.id,
    },
  });
  if (checklistItem) await syncAlerts(ctx.organizationId);
  return { document, duplicateOf: duplicate };
}

export async function updateDocument(ctx: ServiceContext, documentId: string, input: unknown) {
  authorize(ctx, "document:write");
  const existing = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Documento");
  const data = documentUpdateSchema.parse(input);
  if (data.companyId) await assertCompanyInOrg(ctx, data.companyId);
  const companyChanged = data.companyId !== undefined && data.companyId !== existing.companyId;
  const document = await db.document.update({
    where: { id: documentId },
    data: {
      companyId: data.companyId,
      type: data.type,
      typeSource: data.type && data.type !== existing.type ? "USER" : undefined,
      classificationConfidence: data.type && data.type !== existing.type ? 1 : undefined,
      fiscalYear: data.fiscalYear,
      description: data.description,
    },
    select: listSelect,
  });
  if (companyChanged) {
    await db.documentChunk.updateMany({ where: { documentId }, data: { companyId: data.companyId ?? null } });
    await db.documentExtraction.updateMany({
      where: { documentId, status: "PENDING_REVIEW" },
      data: { companyId: data.companyId ?? null },
    });
  }
  await audit(ctx, {
    action: "document.update",
    entityType: "Document",
    entityId: documentId,
    companyId: document.companyId,
    metadata: { fields: Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => k), fileName: document.fileName },
  });
  return document;
}

export async function deleteDocument(ctx: ServiceContext, documentId: string) {
  authorize(ctx, "document:delete");
  const existing = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId } });
  if (!existing) throw new NotFoundError("Documento");
  await db.document.delete({ where: { id: documentId } });
  await getStorage()
    .delete(existing.storageKey)
    .catch(() => undefined);
  await audit(ctx, {
    action: "document.delete",
    entityType: "Document",
    entityId: documentId,
    companyId: existing.companyId,
    metadata: { fileName: existing.fileName },
  });
  await syncAlerts(ctx.organizationId);
  return { ok: true };
}

export async function getDocumentFile(ctx: ServiceContext, documentId: string) {
  authorize(ctx, "document:read");
  const document = await db.document.findFirst({
    where: { id: documentId, organizationId: ctx.organizationId },
    select: { storageKey: true, fileName: true, mimeType: true },
  });
  if (!document) throw new NotFoundError("Documento");
  const bytes = await getStorage().get(document.storageKey);
  return { bytes, fileName: document.fileName, mimeType: document.mimeType };
}

export async function getDocumentText(ctx: ServiceContext, documentId: string) {
  authorize(ctx, "document:read");
  const document = await db.document.findFirst({
    where: { id: documentId, organizationId: ctx.organizationId },
    select: { extractedText: true, pageCount: true },
  });
  if (!document) throw new NotFoundError("Documento");
  return document;
}
