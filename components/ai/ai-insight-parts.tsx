"use client";

import { ListPlus, Loader2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BasisBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/client/api";
import { formatDateTime } from "@/lib/financial/format";
import type { BasisKey, TaskPriorityKey } from "@/lib/labels";

export interface SourceRef {
  id: string;
  type: string;
  entityId: string | null;
  label: string;
  href?: string | null;
}

export function useAIAction(url: string, successMessage: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    startTransition(async () => {
      setError(null);
      try {
        await api(url, { method: "POST" });
        toast.success(successMessage);
        router.refresh();
      } catch (err) {
        setError(errorText(err));
        toast.error(errorText(err));
      }
    });
  return { pending, error, run };
}

export function GenerateButton({ pending, onClick, hasResult, label, disabled }: { pending: boolean; onClick: () => void; hasResult: boolean; label: string; disabled?: boolean }) {
  return (
    <Button size="sm" variant={hasResult ? "outline" : "default"} onClick={onClick} disabled={pending || disabled} data-testid={`generate-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      {pending ? <Loader2 className="animate-spin" /> : hasResult ? <RefreshCw /> : <Sparkles />}
      {pending ? "Generazione in corso…" : hasResult ? "Rigenera" : label}
    </Button>
  );
}

export function AIMeta({ model, createdAt, provider }: { model?: string; createdAt: Date | string; provider?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <Sparkles className="size-3 text-violet-600" />
      Generato {formatDateTime(createdAt)}
      {model ? ` · ${provider ? `${provider} / ` : ""}${model}` : ""}
      <span>· contenuto AI da verificare</span>
    </p>
  );
}

export function BasisLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <BasisBadge basis="DATO" /> da documento/database
      <BasisBadge basis="CALCOLO" /> calcolato dal sistema
      <BasisBadge basis="INTERPRETAZIONE" /> lettura AI
      <BasisBadge basis="IPOTESI" /> da verificare
    </div>
  );
}

export function ItemList({
  items,
}: {
  items: { text: string; basis: BasisKey; refs?: string[] }[];
}) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">Nessun elemento.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
          <span className="mt-px">
            <BasisBadge basis={item.basis} />
          </span>
          <span>
            {item.text}
            {item.refs && item.refs.length > 0 && <span className="ml-1 font-mono text-[10px] text-muted-foreground">[{item.refs.join(", ")}]</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CreateTaskButton({ title, description, companyId, priority = "MEDIUM" }: { title: string; description?: string; companyId: string | null; priority?: TaskPriorityKey }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  async function create() {
    setState("busy");
    try {
      await api("/api/tasks", { body: { title: title.slice(0, 200), description, companyId, priority, source: "BRIEFING" } });
      toast.success("Task creato");
      setState("done");
    } catch (error) {
      toast.error(errorText(error));
      setState("idle");
    }
  }
  return (
    <Button size="xs" variant="ghost" onClick={create} disabled={state !== "idle"} className="shrink-0">
      {state === "busy" ? <Loader2 className="animate-spin" /> : <ListPlus />}
      {state === "done" ? "Creato" : "Task"}
    </Button>
  );
}

export function SourcesList({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  return (
    <div data-testid="sources-list">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fonti utilizzate</div>
      <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
        {sources.map((s) => (
          <li key={`${s.id}-${s.label}`} className="flex gap-1.5 truncate">
            <span className="font-mono text-[10px] text-muted-foreground">{s.id}</span>
            {s.href ? (
              <Link href={s.href} className="truncate text-primary hover:underline">
                {s.label}
              </Link>
            ) : (
              <span className="truncate">{s.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
