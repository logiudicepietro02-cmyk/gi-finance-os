/**
 * Document intelligence pipeline:
 * EXTRACT_TEXT → CLASSIFY → EXTRACT_DATA → VALIDATE → SAVE → UPDATE_COMPANY → METRICS → ALERTS → INSIGHTS
 *
 * Runs in-process today (invoked by the API); the entry point is queue-ready.
 * Each step is persisted to Document.processingLog so the UI can show progress and outcome.
 */
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { runAI } from "@/lib/ai/runs";
import {
  DOCUMENT_SYSTEM_PROMPT,
  classificationPrompt,
  documentInsightPrompt,
  extractionPrompt,
} from "@/lib/ai/prompts";
import type { AIProvider } from "@/lib/ai/types";
import { audit } from "@/lib/audit";
import { db, toJson, type Prisma } from "@/lib/db";
import { extractBilancioByRules } from "@/lib/documents/bilancio-rules";
import { classifyByRules, extractTaxId } from "@/lib/documents/classify-rules";
import { crossCheckExtractions } from "@/lib/documents/cross-check";
import { deriveBilancioFields, normalizeUnits } from "@/lib/documents/derive";
import {
  BILANCIO_SCHEMA_VERSION,
  bilancioExtractionSchema,
  countExtractedFields,
  type BilancioExtraction,
} from "@/lib/documents/extraction-schema";
import { chunkPages, extractPdfPages, tagPages } from "@/lib/documents/pdf-text";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, FINANCIAL_STATEMENT_TYPES, type DocumentTypeKey } from "@/lib/documents/types";
import { validateBilancioExtraction } from "@/lib/documents/validation";
import { conflict, errorMessage } from "@/lib/errors";
import { computeRatios } from "@/lib/financial/ratios";
import { NotFoundError } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";
import { syncAlerts } from "@/services/alerts";
import { authorize, type ServiceContext } from "@/services/context";
import { applyExtraction, extractionToValues } from "@/services/financials";
import { refreshVariationInsights } from "@/services/insights";

export { PIPELINE_STEPS, type PipelineStep, type StepLog, type StepStatus } from "@/lib/documents/pipeline";
import type { PipelineStep, StepLog, StepStatus } from "@/lib/documents/pipeline";

const MAX_AI_TEXT_CHARS = 400_000;
const STALE_PROCESSING_MS = 5 * 60 * 1000;

const classificationSchema = z.strictObject({
  document_type: z.enum(DOCUMENT_TYPES),
  fiscal_year: z.number().int().min(1990).max(2100).nullable(),
  company_name: z.string().nullable(),
  tax_id: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const documentInsightSchema = z.strictObject({
  summary: z.string(),
  key_points: z.array(z.string()),
  relevant_dates: z.array(z.strictObject({ date: z.string(), description: z.string() })),
});

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "n.d." : `${Math.round(n * 100)}%`);

export async function processDocument(ctx: ServiceContext, documentId: string) {
  authorize(ctx, "document:write");
  const doc = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId } });
  if (!doc) throw new NotFoundError("Documento");
  if (doc.status === "PROCESSING" && Date.now() - doc.updatedAt.getTime() < STALE_PROCESSING_MS) {
    throw conflict("Analisi già in corso per questo documento.");
  }

  const actor = { organizationId: ctx.organizationId, userId: ctx.userId };
  const log: StepLog[] = [];
  const persist = () => db.document.update({ where: { id: doc.id }, data: { processingLog: toJson(log) as Prisma.InputJsonValue } });

  async function step<T>(name: PipelineStep, fn: () => Promise<{ value: T; status?: StepStatus; message?: string | null }>): Promise<T> {
    const entry: StepLog = { step: name, status: "running", message: null, startedAt: new Date().toISOString(), finishedAt: null };
    log.push(entry);
    await persist();
    try {
      const r = await fn();
      entry.status = r.status ?? "done";
      entry.message = r.message ?? null;
      return r.value;
    } catch (error) {
      entry.status = "failed";
      entry.message = errorMessage(error);
      throw error;
    } finally {
      entry.finishedAt = new Date().toISOString();
      await persist();
    }
  }

  function skip(name: PipelineStep, message: string) {
    const now = new Date().toISOString();
    log.push({ step: name, status: "skipped", message, startedAt: now, finishedAt: now });
  }

  await db.document.update({
    where: { id: doc.id },
    data: { status: "PROCESSING", errorMessage: null, processingLog: [] },
  });

  const configured = getAIProvider();
  const docAI: AIProvider | null = configured?.supportsDocumentAI ? configured : null;
  let extractionId: string | null = null;
  let appliedAction: string | null = null;

  try {
    // 1 ─ EXTRACT_TEXT
    const text = await step("EXTRACT_TEXT", async () => {
      const bytes = await getStorage().get(doc.storageKey);
      const { pages, pageCount } = await extractPdfPages(bytes);
      const joined = pages.join("\n\f\n");
      const chunks = chunkPages(pages);
      await db.$transaction([
        db.documentChunk.deleteMany({ where: { documentId: doc.id } }),
        db.documentChunk.createMany({
          data: chunks.map((c) => ({ ...c, organizationId: ctx.organizationId, companyId: doc.companyId, documentId: doc.id })),
        }),
        db.document.update({ where: { id: doc.id }, data: { pageCount, extractedText: joined } }),
      ]);
      const chars = joined.replace(/\s/g, "").length;
      const scanned = chars < 50;
      return {
        value: { bytes, pages, pageCount, joined, scanned },
        status: scanned ? ("warning" as const) : ("done" as const),
        message: scanned
          ? `Nessun testo selezionabile su ${pageCount} pagine (probabile scansione).${docAI ? " Il PDF verrà analizzato direttamente dall'AI." : " Configura un provider AI per analizzare documenti scansionati."}`
          : `${pageCount} pagine, ${chars.toLocaleString("it-IT")} caratteri, ${chunks.length} blocchi indicizzati per la ricerca.`,
      };
    });

    // 2 ─ CLASSIFY
    const classification = await step("CLASSIFY", async () => {
      const rules = classifyByRules(text.joined);
      let type: DocumentTypeKey = doc.type;
      let typeSource = doc.typeSource;
      let confidence = doc.classificationConfidence;
      let fiscalYear = doc.fiscalYear ?? rules.fiscalYear;
      let taxId: string | null = extractTaxId(text.joined);
      let status: StepStatus = "done";
      let message: string;

      if (doc.typeSource === "USER") {
        message = `Tipo impostato dall'utente: ${DOCUMENT_TYPE_LABELS[doc.type]} (regole: ${DOCUMENT_TYPE_LABELS[rules.type]}).`;
      } else if (docAI && (!text.scanned || docAI.supportsDocumentAI)) {
        try {
          const excerpt = text.joined.slice(0, 12_000);
          const { result } = await runAI(
            actor,
            { kind: "DOCUMENT_CLASSIFICATION", companyId: doc.companyId, input: { documentId: doc.id, fileName: doc.fileName, excerptChars: excerpt.length } },
            docAI,
            async () => {
              const r = await docAI.generateObject({
                system: DOCUMENT_SYSTEM_PROMPT,
                prompt: classificationPrompt(doc.fileName, text.scanned ? "" : excerpt, text.joined.length),
                schema: classificationSchema,
                schemaName: "document_classification",
                pdf: text.scanned ? text.bytes : undefined,
                effort: "low",
                maxTokens: 4000,
              });
              return { result: r.object, output: r.object, usage: r.usage };
            },
          );
          type = result.document_type;
          typeSource = "AI";
          confidence = result.confidence;
          fiscalYear = result.fiscal_year ?? rules.fiscalYear ?? doc.fiscalYear;
          taxId = result.tax_id?.replace(/\D/g, "").slice(-11) || taxId;
          const agree = rules.type === result.document_type;
          message = `AI: ${DOCUMENT_TYPE_LABELS[type]} (confidenza ${pct(confidence)}). Regole: ${DOCUMENT_TYPE_LABELS[rules.type]}${agree ? " — concordi." : " — discordanti, verificare."}`;
          if (!agree) status = "warning";
        } catch (error) {
          type = rules.type;
          typeSource = "RULES";
          confidence = rules.confidence;
          status = "warning";
          message = `Classificazione AI non riuscita (${errorMessage(error)}): usate le regole → ${DOCUMENT_TYPE_LABELS[type]} (confidenza ${pct(confidence)}).`;
        }
      } else {
        type = rules.type;
        typeSource = "RULES";
        confidence = rules.confidence;
        message = `Regole: ${DOCUMENT_TYPE_LABELS[type]} (confidenza ${pct(confidence)})${rules.matchedKeywords.length ? ` — ${rules.matchedKeywords.slice(0, 4).join(", ")}` : ""}.`;
      }

      let companyId = doc.companyId;
      if (!companyId && taxId) {
        const match = await db.company.findFirst({
          where: { organizationId: ctx.organizationId, OR: [{ vatNumber: taxId }, { taxCode: taxId }] },
          select: { id: true, name: true },
        });
        if (match) {
          companyId = match.id;
          message += ` Associato automaticamente a ${match.name} (P.IVA ${taxId}).`;
        }
      }
      if (!companyId) {
        message += " Documento non associato a un'azienda.";
        status = "warning";
      }

      await db.document.update({
        where: { id: doc.id },
        data: { type, typeSource, classificationConfidence: confidence, fiscalYear, companyId },
      });
      if (companyId !== doc.companyId) {
        await db.documentChunk.updateMany({ where: { documentId: doc.id }, data: { companyId } });
      }
      return { value: { type, fiscalYear, companyId }, status, message };
    });

    const isFinancial = FINANCIAL_STATEMENT_TYPES.includes(classification.type);
    if (!isFinancial) {
      const reason = `Estrazione strutturata prevista solo per bilanci e situazioni contabili (${DOCUMENT_TYPE_LABELS[classification.type]}).`;
      skip("EXTRACT_DATA", reason);
      skip("VALIDATE", reason);
      skip("SAVE", reason);
      skip("UPDATE_COMPANY", reason);
      skip("METRICS", reason);
    } else {
      // 3 ─ EXTRACT_DATA
      type ExtractionOutcome = { data: BilancioExtraction; method: "AI" | "RULES"; aiRunId: string | null; crossCheck: string[] };
      const extraction = await step<ExtractionOutcome>("EXTRACT_DATA", async () => {
        const rules = extractBilancioByRules(text.pages);
        if (docAI) {
          try {
            if (text.joined.length > MAX_AI_TEXT_CHARS) {
              throw new Error(`documento di ${text.joined.length.toLocaleString("it-IT")} caratteri oltre il limite di ${MAX_AI_TEXT_CHARS.toLocaleString("it-IT")}`);
            }
            const { result, runId } = await runAI(
              actor,
              { kind: "DOCUMENT_EXTRACTION", companyId: classification.companyId, input: { documentId: doc.id, fileName: doc.fileName, pages: text.pageCount } },
              docAI,
              async () => {
                const r = await docAI.generateObject({
                  system: DOCUMENT_SYSTEM_PROMPT,
                  prompt: extractionPrompt(text.scanned ? null : tagPages(text.pages)),
                  schema: bilancioExtractionSchema,
                  schemaName: "bilancio_extraction",
                  pdf: text.scanned ? text.bytes : undefined,
                  effort: "medium",
                  maxTokens: 16000,
                });
                return { result: r.object, output: r.object, usage: r.usage };
              },
            );
            const normalized = normalizeUnits(result);
            const checked = crossCheckExtractions(normalized, rules);
            const data = deriveBilancioFields(checked.data);
            return {
              value: { data, method: "AI" as const, aiRunId: runId, crossCheck: checked.notes },
              status: checked.notes.length ? ("warning" as const) : ("done" as const),
              message: `AI (${docAI.model}): ${countExtractedFields(data)} campi. Controllo incrociato con le regole: ${checked.notes.length ? `${checked.notes.length} segnalazioni` : "coerente"}.`,
            };
          } catch (error) {
            return {
              value: { data: rules, method: "RULES" as const, aiRunId: null, crossCheck: [] as string[] },
              status: "warning" as const,
              message: `Estrazione AI non riuscita (${errorMessage(error)}): usato l'estrattore a regole (${countExtractedFields(rules)} campi).`,
            };
          }
        }
        return {
          value: { data: rules, method: "RULES" as const, aiRunId: null, crossCheck: [] as string[] },
          message: `Estrattore a regole (schema CEE): ${countExtractedFields(rules)} campi estratti.`,
        };
      });

      // 4 ─ VALIDATE
      const validation = await step("VALIDATE", async () => {
        const v = validateBilancioExtraction(extraction.data);
        const warnings = [...v.warnings, ...extraction.crossCheck];
        return {
          value: { valid: v.valid, errors: v.errors, warnings },
          status: !v.valid || warnings.length ? ("warning" as const) : ("done" as const),
          message: v.valid
            ? warnings.length
              ? `Schema valido, ${warnings.length} segnalazioni da verificare.`
              : "Schema valido, nessuna incoerenza contabile."
            : `Estrazione non valida: ${v.errors.slice(0, 3).join("; ")}`,
        };
      });

      // 5 ─ SAVE
      const data: BilancioExtraction = extraction.data;
      const fiscalYear = data.fiscal_year ?? classification.fiscalYear;
      const saved = await step("SAVE", async () => {
        await db.documentExtraction.updateMany({
          where: { documentId: doc.id, status: "PENDING_REVIEW" },
          data: { status: "REJECTED", reviewNotes: "Superata da una nuova elaborazione del documento." },
        });
        const confidences = Object.values(data.fields).map((f) => f.confidence).filter((c): c is number => c !== null);
        const created = await db.documentExtraction.create({
          data: {
            organizationId: ctx.organizationId,
            documentId: doc.id,
            companyId: classification.companyId,
            documentType: classification.type,
            method: extraction.method,
            status: "PENDING_REVIEW",
            schemaVersion: BILANCIO_SCHEMA_VERSION,
            fiscalYear,
            data: toJson(data) as Prisma.InputJsonValue,
            validation: toJson(validation) as Prisma.InputJsonValue,
            confidence: confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100 : null,
            aiRunId: extraction.aiRunId,
            appliedAction: "NONE",
          },
        });
        if (fiscalYear && fiscalYear !== classification.fiscalYear) {
          await db.document.update({ where: { id: doc.id }, data: { fiscalYear } });
        }
        return { value: created, message: `Estrazione salvata (${validation.valid ? "valida" : "non valida"}, in attesa di revisione).` };
      });
      extractionId = saved.id;

      // 6 ─ UPDATE_COMPANY
      let statementId: string | null = null;
      if (!validation.valid) skip("UPDATE_COMPANY", "Estrazione non valida: nessun aggiornamento automatico, revisione manuale richiesta.");
      else if (classification.type !== "BILANCIO") {
        skip("UPDATE_COMPANY", "Situazione contabile infrannuale: i dati estratti restano disponibili per la revisione e non aggiornano il bilancio annuale.");
      } else if (!classification.companyId) skip("UPDATE_COMPANY", "Documento non associato a un'azienda: associalo e rielabora per aggiornare i dati finanziari.");
      else if (!fiscalYear) skip("UPDATE_COMPANY", "Esercizio non individuato: indicalo sul documento e rielabora.");
      else {
        const applied = await step("UPDATE_COMPANY", async () => {
          const r = await applyExtraction(actor, {
            extractionId: saved.id,
            documentId: doc.id,
            companyId: classification.companyId as string,
            fiscalYear,
            data,
            method: extraction.method,
          });
          const messages = {
            CREATED_STATEMENT: `Creato il bilancio ${fiscalYear} (stato: da verificare).`,
            UPDATED_UNVERIFIED: `Aggiornato il bilancio ${fiscalYear} non ancora verificato.`,
            PROPOSED_UPDATE: `Il bilancio ${fiscalYear} esiste già: modifiche proposte in attesa di approvazione.`,
            NONE: `I dati coincidono con il bilancio ${fiscalYear} già presente.`,
          } as const;
          return { value: r, status: r.appliedAction === "PROPOSED_UPDATE" ? ("warning" as const) : ("done" as const), message: messages[r.appliedAction] };
        });
        appliedAction = applied.appliedAction;
        if (applied.appliedAction === "CREATED_STATEMENT" || applied.appliedAction === "UPDATED_UNVERIFIED") statementId = applied.statementId;
      }

      // 7 ─ METRICS (recomputed by applyExtraction; report the outcome)
      if (statementId) {
        await step("METRICS", async () => {
          const { values } = extractionToValues(data, { documentId: doc.id, extractionId: saved.id, method: extraction.method });
          const ratios = computeRatios(values);
          const ok = ratios.filter((r) => r.status === "OK").length;
          const missing = ratios.filter((r) => r.status === "MISSING").map((r) => r.label);
          return {
            value: null,
            status: missing.length ? ("warning" as const) : ("done" as const),
            message: `${ok}/${ratios.length} indicatori calcolati.${missing.length ? ` Dato non disponibile per: ${missing.join(", ")}.` : ""}`,
          };
        });
      } else {
        skip("METRICS", appliedAction === "PROPOSED_UPDATE" ? "Indicatori aggiornati dopo l'approvazione." : "Nessun bilancio aggiornato.");
      }
    }

    // 8 ─ ALERTS
    await step("ALERTS", async () => {
      const r = await syncAlerts(ctx.organizationId);
      return { value: r, message: `${r.total} condizioni attive, ${r.created} nuovi alert, ${r.resolved} risolti.` };
    });

    // 9 ─ INSIGHTS
    await step("INSIGHTS", async () => {
      const parts: string[] = [];
      let status: StepStatus = "done";
      if (classification.companyId) {
        const n = await refreshVariationInsights(ctx.organizationId, classification.companyId);
        parts.push(n ? `${n} variazioni significative rilevate.` : "Nessuna variazione significativa (o un solo esercizio disponibile).");
      }
      if (docAI && !isFinancial && !text.scanned && text.joined.length <= MAX_AI_TEXT_CHARS) {
        try {
          const { result, runId } = await runAI(
            actor,
            { kind: "DOCUMENT_INSIGHT", companyId: classification.companyId, input: { documentId: doc.id } },
            docAI,
            async () => {
              const r = await docAI.generateObject({
                system: DOCUMENT_SYSTEM_PROMPT,
                prompt: documentInsightPrompt(doc.fileName, DOCUMENT_TYPE_LABELS[classification.type], tagPages(text.pages)),
                schema: documentInsightSchema,
                schemaName: "document_insight",
                effort: "low",
                maxTokens: 4000,
              });
              return { result: r.object, output: r.object, usage: r.usage };
            },
          );
          await db.insight.create({
            data: {
              organizationId: ctx.organizationId,
              companyId: classification.companyId,
              kind: "DOCUMENT_INSIGHT",
              source: "AI",
              title: `Sintesi: ${doc.fileName}`,
              summary: result.summary,
              content: toJson({ ...result, documentId: doc.id, model: docAI.model }) as Prisma.InputJsonValue,
              sourceRefs: toJson([{ id: "S1", type: "Document", entityId: doc.id, label: doc.fileName, href: `/documents/${doc.id}` }]) as Prisma.InputJsonValue,
              aiRunId: runId,
              createdById: ctx.userId,
            },
          });
          parts.push("Sintesi AI del documento generata.");
        } catch (error) {
          status = "warning";
          parts.push(`Sintesi AI non riuscita: ${errorMessage(error)}.`);
        }
      }
      return { value: null, status, message: parts.join(" ") || "Nessun insight da generare." };
    });

    await db.document.update({ where: { id: doc.id }, data: { status: "PROCESSED", processedAt: new Date() } });
    await audit(ctx, {
      action: "document.process",
      entityType: "Document",
      entityId: doc.id,
      companyId: classification.companyId,
      metadata: { fileName: doc.fileName, type: classification.type, extractionId, appliedAction, aiProvider: docAI?.name ?? null },
    });
    return { documentId: doc.id, status: "PROCESSED" as const, log, extractionId, appliedAction };
  } catch (error) {
    const message = errorMessage(error);
    await db.document.update({
      where: { id: doc.id },
      data: { status: "FAILED", errorMessage: message.slice(0, 1000), processingLog: toJson(log) as Prisma.InputJsonValue },
    });
    await audit(ctx, {
      action: "document.process_failed",
      entityType: "Document",
      entityId: doc.id,
      companyId: doc.companyId,
      metadata: { fileName: doc.fileName, error: message.slice(0, 500) },
    });
    return { documentId: doc.id, status: "FAILED" as const, log, extractionId, appliedAction, error: message };
  }
}
