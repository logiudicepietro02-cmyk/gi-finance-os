import { audit } from "@/lib/audit";
import { db, type Prisma } from "@/lib/db";
import { conflict, isUniqueViolation } from "@/lib/errors";
import { statementToValues, toNumber } from "@/lib/financial/fields";
import { ratiosByKey } from "@/lib/financial/ratios";
import { NotFoundError } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";
import { companyCreateSchema, companyUpdateSchema, contactCreateSchema } from "@/lib/validation/schemas";
import { authorize, type ServiceContext } from "./context";

export async function assertCompanyInOrg(ctx: ServiceContext, companyId: string) {
  const company = await db.company.findFirst({
    where: { id: companyId, organizationId: ctx.organizationId },
    select: { id: true, name: true },
  });
  if (!company) throw new NotFoundError("Azienda");
  return company;
}

export async function assertUserInOrg(ctx: ServiceContext, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, organizationId: ctx.organizationId },
    select: { id: true, name: true },
  });
  if (!user) throw new NotFoundError("Utente");
  return user;
}

export async function listCompanies(ctx: ServiceContext, filters: { q?: string; status?: string } = {}) {
  authorize(ctx, "company:read");
  const where: Prisma.CompanyWhereInput = { organizationId: ctx.organizationId };
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { vatNumber: { contains: q } },
      { city: { contains: q, mode: "insensitive" } },
      { sector: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters.status && ["PROSPECT", "ACTIVE", "ON_HOLD", "CLOSED"].includes(filters.status)) {
    where.status = filters.status as Prisma.CompanyWhereInput["status"];
  }

  const companies = await db.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      assignedAdvisor: { select: { id: true, name: true } },
      statements: { where: { type: "ANNUAL" }, orderBy: { fiscalYear: "desc" }, take: 2 },
      _count: {
        select: {
          alerts: { where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } },
          operations: { where: { status: { notIn: ["COMPLETED", "REJECTED"] } } },
          tasks: { where: { status: { not: "DONE" } } },
          documents: true,
        },
      },
    },
  });

  return companies.map((c) => {
    const [latest, previous] = c.statements;
    const latestValues = latest ? statementToValues(latest) : null;
    const previousValues = previous ? statementToValues(previous) : null;
    const ratios = latestValues ? ratiosByKey(latestValues) : null;
    const revenue = latestValues?.revenue ?? null;
    const prevRevenue = previousValues?.revenue ?? null;
    return {
      id: c.id,
      name: c.name,
      legalForm: c.legalForm,
      vatNumber: c.vatNumber,
      sector: c.sector,
      city: c.city,
      province: c.province,
      status: c.status,
      employees: c.employees,
      advisor: c.assignedAdvisor,
      latestYear: latest?.fiscalYear ?? null,
      latestStatementStatus: latest?.status ?? null,
      revenue: revenue ?? toNumber(c.declaredRevenue),
      revenueFromStatement: revenue !== null,
      revenueGrowth: revenue !== null && prevRevenue ? (revenue - prevRevenue) / Math.abs(prevRevenue) : null,
      ebitdaMargin: ratios?.ebitda_margin ?? null,
      netDebtToEbitda: ratios?.net_debt_to_ebitda ?? null,
      dscr: ratios?.dscr ?? null,
      counts: {
        alerts: c._count.alerts,
        operations: c._count.operations,
        tasks: c._count.tasks,
        documents: c._count.documents,
      },
    };
  });
}

export type CompanyListItem = Awaited<ReturnType<typeof listCompanies>>[number];

export async function getCompany(ctx: ServiceContext, companyId: string) {
  authorize(ctx, "company:read");
  const company = await db.company.findFirst({
    where: { id: companyId, organizationId: ctx.organizationId },
    include: {
      assignedAdvisor: { select: { id: true, name: true, email: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
    },
  });
  if (!company) throw new NotFoundError("Azienda");
  return { ...company, declaredRevenue: toNumber(company.declaredRevenue) };
}

export type CompanyDetail = Awaited<ReturnType<typeof getCompany>>;

export async function createCompany(ctx: ServiceContext, input: unknown) {
  authorize(ctx, "company:write");
  const data = companyCreateSchema.parse(input);
  if (data.assignedAdvisorId) await assertUserInOrg(ctx, data.assignedAdvisorId);
  try {
    const company = await db.company.create({ data: { ...data, organizationId: ctx.organizationId } });
    await audit(ctx, {
      action: "company.create",
      entityType: "Company",
      entityId: company.id,
      companyId: company.id,
      metadata: { name: company.name, vatNumber: company.vatNumber },
    });
    return { ...company, declaredRevenue: toNumber(company.declaredRevenue) };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Esiste già un'azienda con questa partita IVA.");
    throw error;
  }
}

export async function updateCompany(ctx: ServiceContext, companyId: string, input: unknown) {
  authorize(ctx, "company:write");
  await assertCompanyInOrg(ctx, companyId);
  const data = companyUpdateSchema.parse(input);
  if (data.assignedAdvisorId) await assertUserInOrg(ctx, data.assignedAdvisorId);
  const changed = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  try {
    const company = await db.company.update({ where: { id: companyId }, data });
    await audit(ctx, {
      action: "company.update",
      entityType: "Company",
      entityId: companyId,
      companyId,
      metadata: { fields: changed },
    });
    return { ...company, declaredRevenue: toNumber(company.declaredRevenue) };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Esiste già un'azienda con questa partita IVA.");
    throw error;
  }
}

export async function deleteCompany(ctx: ServiceContext, companyId: string) {
  authorize(ctx, "company:delete");
  const company = await assertCompanyInOrg(ctx, companyId);
  const documents = await db.document.findMany({
    where: { organizationId: ctx.organizationId, companyId },
    select: { storageKey: true },
  });
  await db.company.delete({ where: { id: companyId } });
  const storage = getStorage();
  await Promise.all(documents.map((d) => storage.delete(d.storageKey).catch(() => undefined)));
  await audit(ctx, {
    action: "company.delete",
    entityType: "Company",
    entityId: companyId,
    metadata: { name: company.name, documentsDeleted: documents.length },
  });
  return { ok: true };
}

export async function addContact(ctx: ServiceContext, companyId: string, input: unknown) {
  authorize(ctx, "company:write");
  await assertCompanyInOrg(ctx, companyId);
  const data = contactCreateSchema.parse(input);
  const contact = await db.companyContact.create({
    data: { ...data, organizationId: ctx.organizationId, companyId },
  });
  await audit(ctx, {
    action: "contact.create",
    entityType: "CompanyContact",
    entityId: contact.id,
    companyId,
    metadata: { name: contact.name, role: contact.role },
  });
  return contact;
}
