/** Document pipeline step definitions (client-safe). */
export const PIPELINE_STEPS = [
  { key: "EXTRACT_TEXT", label: "Estrazione testo" },
  { key: "CLASSIFY", label: "Classificazione" },
  { key: "EXTRACT_DATA", label: "Estrazione dati strutturati" },
  { key: "VALIDATE", label: "Validazione" },
  { key: "SAVE", label: "Salvataggio" },
  { key: "UPDATE_COMPANY", label: "Aggiornamento azienda" },
  { key: "METRICS", label: "Calcolo indicatori" },
  { key: "ALERTS", label: "Verifica alert" },
  { key: "INSIGHTS", label: "Generazione insight" },
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number]["key"];
export type StepStatus = "running" | "done" | "warning" | "skipped" | "failed";

export interface StepLog {
  step: PipelineStep;
  status: StepStatus;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}
