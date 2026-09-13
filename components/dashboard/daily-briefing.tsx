"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PriorityBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/client/api";
import type { TaskPriorityKey } from "@/lib/labels";

interface DailyBriefingContent {
  headline: string;
  items: { company: string; summary: string; priority: TaskPriorityKey }[];
  focus_of_the_day: string;
  model?: string;
}

export function DailyBriefingPanel({
  briefing,
  aiConfigured,
  hasAttention,
}: {
  briefing: { content: unknown; createdAt: Date | string } | null;
  aiConfigured: boolean;
  hasAttention: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  function generate(force: boolean) {
    startTransition(async () => {
      try {
        setError(null);
        await api(`/api/dashboard${force ? "?force=1" : ""}`, { method: "POST" });
        router.refresh();
      } catch (err) {
        setError(errorText(err));
      }
    });
  }

  useEffect(() => {
    // The narrative briefing is generated automatically once a day, when an AI provider is configured.
    if (aiConfigured && hasAttention && !briefing && !autoStarted.current) {
      autoStarted.current = true;
      generate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiConfigured, hasAttention, briefing]);

  if (!aiConfigured) {
    return (
      <p className="text-xs text-muted-foreground">
        Sintesi AI non disponibile: nessun provider configurato. L&apos;elenco qui sotto è calcolato dalle regole del sistema.
      </p>
    );
  }

  const content = briefing?.content as DailyBriefingContent | undefined;
  if (!content) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {pending ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-violet-600" /> Preparazione della sintesi AI…
          </>
        ) : (
          <>
            {error ? <span className="text-destructive">{error}</span> : "Nessuna sintesi AI per oggi."}
            <Button size="xs" variant="outline" onClick={() => generate(false)}>
              <Sparkles /> Genera sintesi
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-violet-200/70 bg-gradient-to-br from-violet-50/70 to-transparent p-3" data-testid="daily-briefing">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-violet-700">
          <Sparkles className="size-3.5" /> Sintesi AI {content.model ? `· ${content.model}` : ""}
        </span>
        <Button size="icon-xs" variant="ghost" onClick={() => generate(true)} disabled={pending} aria-label="Rigenera sintesi">
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>
      <p className="text-sm font-medium">{content.headline}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground">Priorità di oggi: </span>
        {content.focus_of_the_day}
      </p>
      {content.items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {content.items.map((item, i) => (
            <li key={`${item.company}-${i}`} className="flex items-start gap-2 text-[13px]">
              <PriorityBadge priority={item.priority} />
              <span>
                <span className="font-medium">{item.company}</span> — {item.summary}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Interpretazione generata dall&apos;AI sui fatti selezionati dal sistema: verifica prima di agire.</p>
    </div>
  );
}
