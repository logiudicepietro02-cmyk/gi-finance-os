/** Italian UI labels for enums (client-safe). */

export const COMPANY_STATUSES = ["PROSPECT", "ACTIVE", "ON_HOLD", "CLOSED"] as const;
export const COMPANY_STATUS_LABELS: Record<(typeof COMPANY_STATUSES)[number], string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Attivo",
  ON_HOLD: "Sospeso",
  CLOSED: "Chiuso",
};

export const OPERATION_TYPES = [
  "MUTUO_CHIROGRAFARIO",
  "MUTUO_IPOTECARIO",
  "FINANZIAMENTO_GARANTITO",
  "FIDO_CASSA",
  "ANTICIPO_FATTURE",
  "LEASING",
  "FACTORING",
  "MINIBOND",
  "ALTRO",
] as const;
export type OperationTypeKey = (typeof OPERATION_TYPES)[number];
export const OPERATION_TYPE_LABELS: Record<OperationTypeKey, string> = {
  MUTUO_CHIROGRAFARIO: "Mutuo chirografario",
  MUTUO_IPOTECARIO: "Mutuo ipotecario",
  FINANZIAMENTO_GARANTITO: "Finanziamento garantito (MCC)",
  FIDO_CASSA: "Fido di cassa",
  ANTICIPO_FATTURE: "Anticipo fatture",
  LEASING: "Leasing",
  FACTORING: "Factoring",
  MINIBOND: "Minibond",
  ALTRO: "Altro",
};

export const OPERATION_SOURCES = ["CLIENTE_PROPRIO", "STUDIO_MARTINELLI", "STUDIO_GI", "ALTRO"] as const;
export type OperationSourceKey = (typeof OPERATION_SOURCES)[number];
export const OPERATION_SOURCE_LABELS: Record<OperationSourceKey, string> = {
  CLIENTE_PROPRIO: "Cliente proprio",
  STUDIO_MARTINELLI: "Studio Martinelli",
  STUDIO_GI: "Studio GI",
  ALTRO: "Altro",
};

export const OPERATION_STATUSES = [
  "LEAD",
  "ANALYSIS",
  "DOCUMENTATION",
  "SUBMITTED",
  "NEGOTIATION",
  "APPROVED",
  "COMPLETED",
  "REJECTED",
] as const;
export type OperationStatusKey = (typeof OPERATION_STATUSES)[number];
export const OPERATION_STATUS_LABELS: Record<OperationStatusKey, string> = {
  LEAD: "Lead",
  ANALYSIS: "Analisi",
  DOCUMENTATION: "Documentazione",
  SUBMITTED: "Presentata",
  NEGOTIATION: "Negoziazione",
  APPROVED: "Deliberata",
  COMPLETED: "Erogata / Completata",
  REJECTED: "Respinta",
};
export const OPEN_OPERATION_STATUSES: OperationStatusKey[] = ["LEAD", "ANALYSIS", "DOCUMENTATION", "SUBMITTED", "NEGOTIATION", "APPROVED"];

export const RATE_TYPE_LABELS = { FIXED: "Fisso", VARIABLE: "Variabile" } as const;

export const FEE_TYPE_LABELS = { FIXED: "Importo fisso (€)", PERCENTAGE: "% sull'importo" } as const;
export const DISCOUNT_TYPE_LABELS = { PERCENTAGE: "% sconto", FIXED: "Importo fisso (€)" } as const;

export const CHECKLIST_STATUSES = ["MISSING", "REQUESTED", "RECEIVED", "VERIFIED"] as const;
export type ChecklistStatusKey = (typeof CHECKLIST_STATUSES)[number];
export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatusKey, string> = {
  MISSING: "Mancante",
  REQUESTED: "Richiesto",
  RECEIVED: "Ricevuto",
  VERIFIED: "Verificato",
};

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "DONE"] as const;
export type TaskStatusKey = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatusKey, string> = {
  TODO: "Da fare",
  IN_PROGRESS: "In corso",
  WAITING: "In attesa",
  DONE: "Completato",
};

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TaskPriorityKey = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriorityKey, string> = {
  LOW: "Bassa",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Critica",
};

export const TASK_SOURCE_LABELS = {
  MANUAL: "Manuale",
  AI: "AI",
  BRIEFING: "Briefing",
  ALERT: "Alert",
  CHECKLIST: "Checklist",
} as const;

export const ALERT_SEVERITY_LABELS = { INFO: "Info", WARNING: "Attenzione", CRITICAL: "Critico" } as const;
export const ALERT_STATUS_LABELS = {
  OPEN: "Aperto",
  ACKNOWLEDGED: "Preso in carico",
  RESOLVED: "Risolto",
  DISMISSED: "Archiviato",
} as const;
export const ALERT_TYPE_LABELS = {
  DSCR_BELOW_THRESHOLD: "DSCR sotto soglia",
  NET_DEBT_EBITDA_ABOVE_THRESHOLD: "PFN/EBITDA sopra soglia",
  FINANCING_MATURITY: "Scadenza finanziamento",
  MISSING_REQUIRED_DOCUMENT: "Documenti mancanti",
  TASK_OVERDUE: "Task scaduto",
} as const;

export const EXTRACTION_STATUS_LABELS = {
  PENDING_REVIEW: "Da verificare",
  APPROVED: "Approvata",
  REJECTED: "Rifiutata",
} as const;
export const EXTRACTION_METHOD_LABELS = { AI: "AI", RULES: "Regole", MANUAL: "Manuale", SEED: "Import" } as const;
export const STATEMENT_STATUS_LABELS = { EXTRACTED: "Da verificare", VERIFIED: "Verificato" } as const;
export const DOCUMENT_STATUS_LABELS = {
  UPLOADED: "Da analizzare",
  PROCESSING: "In analisi",
  PROCESSED: "Analizzato",
  FAILED: "Errore",
} as const;
export const APPLIED_ACTION_LABELS: Record<string, string> = {
  CREATED_STATEMENT: "Bilancio creato (da verificare)",
  UPDATED_UNVERIFIED: "Bilancio aggiornato (da verificare)",
  PROPOSED_UPDATE: "Modifica proposta: richiede approvazione",
  NONE: "Nessuna modifica",
};

export const BASIS_LABELS = {
  DATO: "Dato",
  CALCOLO: "Calcolo",
  INTERPRETAZIONE: "Interpretazione",
  IPOTESI: "Ipotesi",
} as const;
export type BasisKey = keyof typeof BASIS_LABELS;
