"use client";

import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle, Play, RotateCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DocumentStatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/client/api";
import { PIPELINE_STEPS, type StepLog } from "@/lib/documents/pipeline";
import { DOCUMENT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

type DocStatus = keyof typeof DOCUMENT_STATUS_LABELS;

const ICONS = {
  running: <Loader2 className="size-4 animate-spin text-sky-600" />,
  done: <CheckCircle2 className="size-4 text-emerald-600" />,
  warning: <AlertTriangle className="size-4 text-amber-500" />,
  skipped: <MinusCircle className="size-4 text-muted-foreground/60" />,
  failed: <XCircle className="size-4 text-red-600" />,
  pending: <Circle className="size-4 text-muted-foreground/40" />,
};

export function DocumentProcessor({
  documentId,
  initialStatus,
  initialLog,
  initialError,
  autoStart,
  canProcess,
}: {
  documentId: string;
  initialStatus: DocStatus;
  initialLog: StepLog[];
  initialError: string | null;
  autoStart: boolean;
  canProcess: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DocStatus>(initialStatus);
  const [log, setLog] = useState<StepLog[]>(initialLog);
  const [error, setError] = useState<string | null>(initialError);
  const [running, setRunning] = useState(false);
  const autoStarted = useRef(false);

  async function start() {
    setRunning(true);
    setStatus("PROCESSING");
    setLog([]);
    setError(null);
    const poll = setInterval(() => {
      api<{ processingLog: StepLog[] | null }>(`/api/documents/${documentId}/status`)
        .then((s) => s.processingLog && setLog(s.processingLog))
        .catch(() => undefined);
    }, 800);
    try {
      const result = await api<{ status: DocStatus; log: StepLog[]; error?: string }>(`/api/documents/${documentId}/process`, { method: "POST" });
      setLog(result.log);
      setStatus(result.status);
      if (result.status === "FAILED") {
        setError(result.error ?? "Analisi non riuscita");
        toast.error("Analisi non riuscita");
      } else {
        toast.success("Documento analizzato");
      }
    } catch (err) {
      setError(errorText(err));
      setStatus("FAILED");
      toast.error(errorText(err));
    } finally {
      clearInterval(poll);
      setRunning(false);
      router.replace(`/documents/${documentId}`);
      router.refresh();
    }
  }

  useEffect(() => {
    if (autoStart && canProcess && initialStatus !== "PROCESSING") {
      // The ref is set inside the timer: with Strict Mode the first (cancelled) mount must not block the real one.
      const timer = setTimeout(() => {
        if (autoStarted.current) return;
        autoStarted.current = true;
        void start();
      }, 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processed = status === "PROCESSED" || status === "FAILED";

  return (
    <div className="space-y-3 p-4" data-testid="document-processor">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          Stato:
          <span data-testid="pipeline-status">
            <DocumentStatusBadge status={status} />
          </span>
        </div>
        {canProcess && (
          <Button size="sm" variant={processed ? "outline" : "default"} onClick={() => void start()} disabled={running} data-testid="process-document">
            {running ? <Loader2 className="animate-spin" /> : processed ? <RotateCw /> : <Play />}
            {running ? "Analisi in corso…" : processed ? "Rielabora" : "Analizza documento"}
          </Button>
        )}
      </div>
      <ol className="space-y-1.5">
        {PIPELINE_STEPS.map((s) => {
          const entry = log.find((l) => l.step === s.key);
          const state = entry?.status ?? "pending";
          return (
            <li key={s.key} className="flex items-start gap-2.5">
              <span className="mt-0.5">{ICONS[state]}</span>
              <div className="min-w-0">
                <div className={cn("text-[13px]", state === "pending" ? "text-muted-foreground" : "font-medium")}>{s.label}</div>
                {entry?.message && <div className={cn("text-xs", state === "failed" ? "text-red-600" : "text-muted-foreground")}>{entry.message}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
