import { DOCUMENT_TYPE_LABELS, type DocumentTypeKey } from "@/lib/documents/types";
import {
  ALERT_SEVERITY_LABELS,
  BASIS_LABELS,
  CHECKLIST_STATUS_LABELS,
  COMPANY_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  EXTRACTION_STATUS_LABELS,
  OPERATION_STATUS_LABELS,
  STATEMENT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type BasisKey,
  type ChecklistStatusKey,
  type OperationStatusKey,
  type TaskPriorityKey,
  type TaskStatusKey,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-sky-50 text-sky-700 ring-sky-600/15",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/20",
  danger: "bg-red-50 text-red-700 ring-red-600/15",
  primary: "bg-primary/[0.07] text-primary ring-primary/15",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  primary: "bg-primary",
  violet: "bg-violet-500",
};

export function Pill({ tone = "neutral", dot, className, children, title }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: "INFO" | "WARNING" | "CRITICAL" }) {
  const tone: Tone = severity === "CRITICAL" ? "danger" : severity === "WARNING" ? "warning" : "info";
  return (
    <Pill tone={tone} dot>
      {ALERT_SEVERITY_LABELS[severity]}
    </Pill>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatusKey }) {
  const tone: Tone = { TODO: "neutral", IN_PROGRESS: "info", WAITING: "violet", DONE: "success" }[status] as Tone;
  return <Pill tone={tone}>{TASK_STATUS_LABELS[status]}</Pill>;
}

export function PriorityBadge({ priority }: { priority: TaskPriorityKey }) {
  const tone: Tone = { LOW: "neutral", MEDIUM: "info", HIGH: "warning", CRITICAL: "danger" }[priority] as Tone;
  return <Pill tone={tone}>{TASK_PRIORITY_LABELS[priority]}</Pill>;
}

export function OperationStatusBadge({ status }: { status: OperationStatusKey }) {
  const tone: Tone = (
    { LEAD: "neutral", ANALYSIS: "info", DOCUMENTATION: "warning", SUBMITTED: "primary", NEGOTIATION: "violet", APPROVED: "success", COMPLETED: "success", REJECTED: "danger" } as const
  )[status];
  return (
    <Pill tone={tone} dot>
      {OPERATION_STATUS_LABELS[status]}
    </Pill>
  );
}

export function ChecklistStatusBadge({ status }: { status: ChecklistStatusKey }) {
  const tone: Tone = ({ MISSING: "danger", REQUESTED: "warning", RECEIVED: "success", VERIFIED: "primary" } as const)[status];
  return <Pill tone={tone}>{CHECKLIST_STATUS_LABELS[status]}</Pill>;
}

export function DocumentStatusBadge({ status }: { status: keyof typeof DOCUMENT_STATUS_LABELS }) {
  const tone: Tone = ({ UPLOADED: "neutral", PROCESSING: "info", PROCESSED: "success", FAILED: "danger" } as const)[status];
  return <Pill tone={tone}>{DOCUMENT_STATUS_LABELS[status]}</Pill>;
}

export function DocumentTypeBadge({ type }: { type: DocumentTypeKey }) {
  return <Pill tone="neutral">{DOCUMENT_TYPE_LABELS[type]}</Pill>;
}

export function ExtractionStatusBadge({ status }: { status: keyof typeof EXTRACTION_STATUS_LABELS }) {
  const tone: Tone = ({ PENDING_REVIEW: "warning", APPROVED: "success", REJECTED: "neutral" } as const)[status];
  return <Pill tone={tone}>{EXTRACTION_STATUS_LABELS[status]}</Pill>;
}

export function StatementStatusBadge({ status }: { status: keyof typeof STATEMENT_STATUS_LABELS }) {
  return <Pill tone={status === "VERIFIED" ? "success" : "warning"}>{STATEMENT_STATUS_LABELS[status]}</Pill>;
}

export function CompanyStatusBadge({ status }: { status: keyof typeof COMPANY_STATUS_LABELS }) {
  const tone: Tone = ({ PROSPECT: "violet", ACTIVE: "success", ON_HOLD: "warning", CLOSED: "neutral" } as const)[status];
  return <Pill tone={tone}>{COMPANY_STATUS_LABELS[status]}</Pill>;
}

export function BasisBadge({ basis }: { basis: BasisKey }) {
  const tone: Tone = ({ DATO: "primary", CALCOLO: "info", INTERPRETAZIONE: "violet", IPOTESI: "warning" } as const)[basis];
  return <Pill tone={tone}>{BASIS_LABELS[basis]}</Pill>;
}

export function SourceBadge({ source }: { source: "AI" | "RULES" | "MANUAL" | "SEED" | "COMPUTED" | string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    AI: { tone: "violet", label: "AI" },
    RULES: { tone: "info", label: "Regole" },
    MANUAL: { tone: "primary", label: "Manuale" },
    SEED: { tone: "neutral", label: "Import" },
    COMPUTED: { tone: "neutral", label: "Calcolato" },
    USER: { tone: "primary", label: "Utente" },
  };
  const item = map[source] ?? { tone: "neutral" as Tone, label: source };
  return <Pill tone={item.tone}>{item.label}</Pill>;
}
