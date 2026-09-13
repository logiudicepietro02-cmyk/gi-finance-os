/** Shared input schemas (client-safe: no server imports). */
import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/documents/types";
import { STATEMENT_FIELDS } from "@/lib/financial/fields";
import {
  CHECKLIST_STATUSES,
  COMPANY_STATUSES,
  OPERATION_SOURCES,
  OPERATION_STATUSES,
  OPERATION_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/lib/labels";

/** Optional text: "" → null, undefined stays undefined (= "not provided" on updates). */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

const id = z
  .string()
  .trim()
  .max(64)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

const number = (opts: { int?: boolean; min?: number; max?: number } = {}) =>
  z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      const invalid =
        !Number.isFinite(n) ||
        (opts.int && !Number.isInteger(n)) ||
        (opts.min !== undefined && n < opts.min) ||
        (opts.max !== undefined && n > opts.max);
      if (invalid) {
        ctx.addIssue({ code: "custom", message: "Valore numerico non valido" });
        return z.NEVER;
      }
      return n;
    });

const date = z
  .union([z.string(), z.date()])
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const d = v instanceof Date ? v : new Date(v.length === 10 ? `${v}T12:00:00` : v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Data non valida" });
      return z.NEVER;
    }
    return d;
  });

const vatNumber = z
  .string()
  .trim()
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (!v) return null;
    const normalized = v.replace(/\s/g, "").replace(/^IT/i, "");
    if (!/^\d{11}$/.test(normalized)) {
      ctx.addIssue({ code: "custom", message: "Partita IVA non valida (11 cifre)" });
      return z.NEVER;
    }
    return normalized;
  });

// ─── Companies ────────────────────────────────────────────
const companyFields = {
  legalForm: text(50),
  taxCode: text(20),
  vatNumber,
  reaNumber: text(30),
  atecoCode: text(20),
  sector: text(120),
  address: text(200),
  city: text(100),
  province: text(5),
  postalCode: text(10),
  website: text(200),
  employees: number({ int: true, min: 0, max: 1_000_000 }),
  declaredRevenue: number({ min: 0 }),
  foundedYear: number({ int: true, min: 1800, max: 2100 }),
  assignedAdvisorId: id,
  description: text(2000),
};

export const companyCreateSchema = z.object({
  name: z.string().trim().min(2, "Ragione sociale obbligatoria").max(200),
  status: z.enum(COMPANY_STATUSES).default("ACTIVE"),
  ...companyFields,
});
export const companyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  status: z.enum(COMPANY_STATUSES).optional(),
  ...companyFields,
});
export type CompanyCreateInput = z.input<typeof companyCreateSchema>;

export const contactCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  role: text(120),
  email: z.string().trim().email().max(200).nullish().or(z.literal("")).transform((v) => v || null),
  phone: text(40),
  isPrimary: z.boolean().default(false),
  notes: text(1000),
});

// ─── Tasks ────────────────────────────────────────────────
const taskRefs = {
  description: text(5000),
  companyId: id,
  operationId: id,
  financingDocumentId: id,
  assigneeId: id,
  alertId: id,
  dueDate: date,
};

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2, "Titolo obbligatorio").max(200),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  status: z.enum(TASK_STATUSES).default("TODO"),
  source: z.enum(["MANUAL", "BRIEFING", "ALERT"]).default("MANUAL"),
  ...taskRefs,
});
export const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  ...taskRefs,
});
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

// ─── Financing operations ─────────────────────────────────
/** Optional boolean: undefined stays undefined (= "not provided" on updates); everything else normalizes to true/false. */
const boolish = z
  .union([z.boolean(), z.string()])
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === true || v === "true" || v === "on"));

const operationFields = {
  sourceDetail: text(120),
  amount: number({ min: 0 }),
  outstandingDebt: number({ min: 0 }),
  rate: number({ min: 0, max: 100 }),
  rateType: z.enum(["FIXED", "VARIABLE"]).nullish(),
  durationMonths: number({ int: true, min: 0, max: 600 }),
  startDate: date,
  maturityDate: date,
  probability: number({ int: true, min: 0, max: 100 }),
  guarantee: text(200),
  notes: text(5000),
  ownerId: id,
  // Economia dello studio: fee di mediazione, sconti, retainer mensile
  feeType: z.enum(["FIXED", "PERCENTAGE"]).nullish(),
  feeValue: number({ min: 0 }),
  feeDiscountType: z.enum(["PERCENTAGE", "FIXED"]).nullish(),
  feeDiscountValue: number({ min: 0 }),
  monthlyRetainer: number({ min: 0 }),
  retainerActive: boolish,
  retainerStartDate: date,
  retainerEndDate: date,
  retainerDiscountType: z.enum(["PERCENTAGE", "FIXED"]).nullish(),
  retainerDiscountValue: number({ min: 0 }),
};

export const operationCreateSchema = z.object({
  companyId: z.string().min(1, "Azienda obbligatoria"),
  title: z.string().trim().min(2, "Titolo obbligatorio").max(200),
  bank: z.string().trim().min(2, "Banca obbligatoria").max(120),
  type: z.enum(OPERATION_TYPES),
  status: z.enum(OPERATION_STATUSES).default("LEAD"),
  source: z.enum(OPERATION_SOURCES).default("CLIENTE_PROPRIO"),
  withChecklist: z.boolean().default(true),
  ...operationFields,
});
export const operationUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  bank: z.string().trim().min(2).max(120).optional(),
  type: z.enum(OPERATION_TYPES).optional(),
  status: z.enum(OPERATION_STATUSES).optional(),
  source: z.enum(OPERATION_SOURCES).optional(),
  ...operationFields,
});

export const checklistItemCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  documentType: z.enum(DOCUMENT_TYPES).default("ALTRO"),
  required: z.boolean().default(true),
  dueDate: date,
  notes: text(1000),
});
export const checklistItemUpdateSchema = z.object({
  status: z.enum(CHECKLIST_STATUSES).optional(),
  required: z.boolean().optional(),
  dueDate: date,
  documentId: id,
  notes: text(1000),
});
export const checklistTaskSchema = z.object({
  assigneeId: id,
  dueDate: date,
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
});

// ─── Documents ────────────────────────────────────────────
export const documentUpdateSchema = z.object({
  companyId: id,
  type: z.enum(DOCUMENT_TYPES).optional(),
  fiscalYear: number({ int: true, min: 1990, max: 2100 }),
  description: text(1000),
});

// ─── Financials ───────────────────────────────────────────
const valuesShape = Object.fromEntries(STATEMENT_FIELDS.map((f) => [f, number()])) as Record<
  (typeof STATEMENT_FIELDS)[number],
  ReturnType<typeof number>
>;
export const statementValuesSchema = z.object(valuesShape);

export const statementCreateSchema = z.object({
  fiscalYear: z.coerce.number().int().min(1990).max(2100),
  values: statementValuesSchema,
  notes: text(2000),
});
export const statementUpdateSchema = z.object({
  values: statementValuesSchema,
  notes: text(2000),
});
export const extractionApproveSchema = z.object({
  values: statementValuesSchema.optional(),
  fiscalYear: z.coerce.number().int().min(1990).max(2100).optional(),
  notes: text(2000),
});
export const extractionRejectSchema = z.object({ notes: text(2000) });

// ─── Settings & users ─────────────────────────────────────
export const settingsUpdateSchema = z.object({
  dscrMin: z.coerce.number().min(0).max(10),
  netDebtEbitdaMax: z.coerce.number().min(0).max(20),
  maturityWarningDays: z.coerce.number().int().min(1).max(365),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["OWNER", "ADVISOR", "ANALYST"]),
  password: z.string().min(10).max(200),
});
export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["OWNER", "ADVISOR", "ANALYST"]).optional(),
  isActive: z.boolean().optional(),
});

// ─── AI ───────────────────────────────────────────────────
export const copilotAskSchema = z.object({
  conversationId: id,
  companyId: id,
  message: z.string().trim().min(1, "Scrivi una domanda").max(4000),
});
