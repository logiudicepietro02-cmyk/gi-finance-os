/**
 * Deterministic alert rules. Pure functions: input snapshot → alert candidates.
 * The AI never creates alerts; it may only interpret them.
 */
import { daysUntil } from "@/lib/dates";
import type { StatementValues } from "@/lib/financial/fields";
import { formatDate, formatMultiple } from "@/lib/financial/format";
import { computeRatio } from "@/lib/financial/ratios";
import type { OrgSettings } from "@/lib/settings";

export type AlertTypeKey =
  | "DSCR_BELOW_THRESHOLD"
  | "NET_DEBT_EBITDA_ABOVE_THRESHOLD"
  | "FINANCING_MATURITY"
  | "MISSING_REQUIRED_DOCUMENT"
  | "TASK_OVERDUE";

export type AlertSeverityKey = "INFO" | "WARNING" | "CRITICAL";

export interface AlertCandidate {
  dedupeKey: string;
  type: AlertTypeKey;
  severity: AlertSeverityKey;
  companyId: string | null;
  title: string;
  message: string;
  sourceType: "FinancialStatement" | "FinancingOperation" | "Task";
  sourceId: string;
  data: Record<string, unknown>;
}

export interface AlertRuleInput {
  now: Date;
  settings: OrgSettings;
  companies: {
    id: string;
    name: string;
    latestStatement: { id: string; fiscalYear: number; values: StatementValues } | null;
  }[];
  operations: {
    id: string;
    companyId: string;
    title: string;
    bank: string;
    status: string;
    maturityDate: Date | null;
    checklist: { id: string; name: string; required: boolean; status: string; dueDate: Date | null }[];
  }[];
  tasks: {
    id: string;
    companyId: string | null;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
  }[];
}

export { daysUntil };

/** Operation stages where the document checklist must be complete. */
export const DOCUMENT_COLLECTION_STAGES = ["DOCUMENTATION", "SUBMITTED", "NEGOTIATION"];

export function evaluateDscrRule(input: AlertRuleInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const company of input.companies) {
    const st = company.latestStatement;
    if (!st) continue;
    const dscr = computeRatio("dscr", st.values);
    if (dscr.status !== "OK" || dscr.value === null || dscr.value >= input.settings.dscrMin) continue;
    out.push({
      dedupeKey: `DSCR_BELOW_THRESHOLD:${company.id}`,
      type: "DSCR_BELOW_THRESHOLD",
      severity: dscr.value < 1 ? "CRITICAL" : "WARNING",
      companyId: company.id,
      title: "DSCR sotto soglia",
      message: `DSCR ${formatMultiple(dscr.value)} (bilancio ${st.fiscalYear}) sotto la soglia configurata di ${formatMultiple(input.settings.dscrMin)}.`,
      sourceType: "FinancialStatement",
      sourceId: st.id,
      data: { fiscalYear: st.fiscalYear, value: dscr.value, threshold: input.settings.dscrMin },
    });
  }
  return out;
}

export function evaluateNetDebtEbitdaRule(input: AlertRuleInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const max = input.settings.netDebtEbitdaMax;
  for (const company of input.companies) {
    const st = company.latestStatement;
    if (!st) continue;
    const ratio = computeRatio("net_debt_to_ebitda", st.values);
    const netDebt = computeRatio("net_debt", st.values);
    const base = {
      dedupeKey: `NET_DEBT_EBITDA_ABOVE_THRESHOLD:${company.id}`,
      type: "NET_DEBT_EBITDA_ABOVE_THRESHOLD" as const,
      companyId: company.id,
      sourceType: "FinancialStatement" as const,
      sourceId: st.id,
    };
    if (ratio.status === "OK" && ratio.value !== null && ratio.value > max) {
      out.push({
        ...base,
        severity: ratio.value > max * 1.5 ? "CRITICAL" : "WARNING",
        title: "PFN/EBITDA sopra soglia",
        message: `PFN/EBITDA ${formatMultiple(ratio.value)} (bilancio ${st.fiscalYear}) oltre la soglia configurata di ${formatMultiple(max)}.`,
        data: { fiscalYear: st.fiscalYear, value: ratio.value, threshold: max },
      });
    } else if (
      ratio.status === "NOT_MEANINGFUL" &&
      netDebt.status === "OK" &&
      netDebt.value !== null &&
      netDebt.value > 0 &&
      typeof st.values.ebitda === "number" &&
      st.values.ebitda <= 0
    ) {
      out.push({
        ...base,
        severity: "CRITICAL",
        title: "EBITDA negativo con indebitamento netto",
        message: `Nel bilancio ${st.fiscalYear} l'EBITDA è negativo o nullo a fronte di una PFN positiva: il debito non è coperto dalla gestione operativa.`,
        data: { fiscalYear: st.fiscalYear, value: null, threshold: max, ebitda: st.values.ebitda, netDebt: netDebt.value },
      });
    }
  }
  return out;
}

export function evaluateMaturityRule(input: AlertRuleInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const op of input.operations) {
    if (!op.maturityDate || op.status === "REJECTED") continue;
    const days = daysUntil(input.now, op.maturityDate);
    if (days < 0 || days > input.settings.maturityWarningDays) continue;
    out.push({
      dedupeKey: `FINANCING_MATURITY:${op.id}`,
      type: "FINANCING_MATURITY",
      severity: days <= 30 ? "CRITICAL" : "WARNING",
      companyId: op.companyId,
      title: days === 0 ? "Operazione in scadenza oggi" : `Operazione in scadenza tra ${days} giorni`,
      message: `"${op.title}" con ${op.bank} scade il ${formatDate(op.maturityDate)}.`,
      sourceType: "FinancingOperation",
      sourceId: op.id,
      data: { days, maturityDate: op.maturityDate.toISOString() },
    });
  }
  return out;
}

export function evaluateMissingDocumentsRule(input: AlertRuleInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const op of input.operations) {
    if (!DOCUMENT_COLLECTION_STAGES.includes(op.status)) continue;
    const missing = op.checklist.filter((i) => i.required && (i.status === "MISSING" || i.status === "REQUESTED"));
    if (missing.length === 0) continue;
    const overdue = missing.filter((i) => i.dueDate && daysUntil(input.now, i.dueDate) < 0);
    out.push({
      dedupeKey: `MISSING_REQUIRED_DOCUMENT:${op.id}`,
      type: "MISSING_REQUIRED_DOCUMENT",
      severity: overdue.length > 0 ? "CRITICAL" : "WARNING",
      companyId: op.companyId,
      title: missing.length === 1 ? "1 documento obbligatorio mancante" : `${missing.length} documenti obbligatori mancanti`,
      message: `Operazione "${op.title}": mancano ${missing.map((i) => i.name).join(", ")}.${
        overdue.length ? ` ${overdue.length} richieste oltre la scadenza.` : ""
      }`,
      sourceType: "FinancingOperation",
      sourceId: op.id,
      data: { missing: missing.map((i) => ({ id: i.id, name: i.name })), overdueCount: overdue.length },
    });
  }
  return out;
}

export function evaluateTaskOverdueRule(input: AlertRuleInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const task of input.tasks) {
    if (task.status === "DONE" || !task.dueDate) continue;
    const days = daysUntil(input.now, task.dueDate);
    if (days >= 0) continue;
    out.push({
      dedupeKey: `TASK_OVERDUE:${task.id}`,
      type: "TASK_OVERDUE",
      severity: task.priority === "HIGH" || task.priority === "CRITICAL" ? "CRITICAL" : "WARNING",
      companyId: task.companyId,
      title: "Task scaduto",
      message: `"${task.title}" era in scadenza il ${formatDate(task.dueDate)} (${Math.abs(days)} ${Math.abs(days) === 1 ? "giorno" : "giorni"} fa).`,
      sourceType: "Task",
      sourceId: task.id,
      data: { daysOverdue: Math.abs(days), priority: task.priority },
    });
  }
  return out;
}

export function evaluateAlertRules(input: AlertRuleInput): AlertCandidate[] {
  return [
    ...evaluateDscrRule(input),
    ...evaluateNetDebtEbitdaRule(input),
    ...evaluateMaturityRule(input),
    ...evaluateMissingDocumentsRule(input),
    ...evaluateTaskOverdueRule(input),
  ];
}
