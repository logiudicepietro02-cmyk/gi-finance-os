import { db, toJson, type Prisma } from "@/lib/db";

export type ActorTypeKey = "USER" | "AI" | "SYSTEM";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown> | null;
  actorType?: ActorTypeKey;
  aiRunId?: string | null;
  toolName?: string | null;
}

type AuditActor = { organizationId: string; userId?: string | null };
type Tx = Prisma.TransactionClient | typeof db;

const MAX_METADATA_CHARS = 20_000;

function compactMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return undefined;
  const json = toJson(metadata);
  const text = JSON.stringify(json);
  if (text.length <= MAX_METADATA_CHARS) return json as Prisma.InputJsonValue;
  return { truncated: true, preview: text.slice(0, MAX_METADATA_CHARS) } as Prisma.InputJsonValue;
}

export async function audit(actor: AuditActor, entry: AuditEntry, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId ?? null,
      actorType: entry.actorType ?? "USER",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      companyId: entry.companyId ?? null,
      aiRunId: entry.aiRunId ?? null,
      toolName: entry.toolName ?? null,
      metadata: compactMetadata(entry.metadata),
    },
  });
}

/** Human readable labels for the activity timeline. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "Accesso",
  "auth.logout": "Uscita",
  "company.create": "Azienda creata",
  "company.update": "Azienda aggiornata",
  "company.delete": "Azienda eliminata",
  "contact.create": "Referente aggiunto",
  "document.upload": "Documento caricato",
  "document.update": "Documento aggiornato",
  "document.delete": "Documento eliminato",
  "document.process": "Documento analizzato",
  "document.process_failed": "Analisi documento fallita",
  "extraction.approve": "Dati estratti approvati",
  "extraction.reject": "Dati estratti rifiutati",
  "statement.create": "Bilancio creato",
  "statement.update": "Bilancio aggiornato",
  "statement.verify": "Bilancio verificato",
  "operation.create": "Operazione creata",
  "operation.update": "Operazione aggiornata",
  "operation.status_change": "Stato operazione cambiato",
  "operation.delete": "Operazione eliminata",
  "checklist.create": "Richiesta documento creata",
  "checklist.update": "Checklist aggiornata",
  "task.create": "Task creato",
  "task.update": "Task aggiornato",
  "task.complete": "Task completato",
  "task.delete": "Task eliminato",
  "alert.acknowledge": "Alert preso in carico",
  "alert.dismiss": "Alert archiviato",
  "alert.sync": "Alert aggiornati",
  "approval.approve": "Richiesta approvata",
  "approval.reject": "Richiesta rifiutata",
  "approval.request": "Approvazione richiesta",
  "ai.tool_call": "Tool AI eseguito",
  "ai.copilot": "Domanda al copilot",
  "ai.interpretation": "Interpretazione AI generata",
  "ai.briefing": "Briefing cliente generato",
  "ai.next_best_action": "Next best action generata",
  "ai.operation_summary": "Sintesi operazione generata",
  "ai.daily_briefing": "Briefing giornaliero generato",
  "settings.update": "Impostazioni aggiornate",
  "user.create": "Utente creato",
  "user.update": "Utente aggiornato",
};
