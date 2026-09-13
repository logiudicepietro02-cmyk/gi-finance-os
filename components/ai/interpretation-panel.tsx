"use client";

import { Sparkles } from "lucide-react";
import { AIMeta, BasisLegend, CreateTaskButton, GenerateButton, ItemList, useAIAction } from "@/components/ai/ai-insight-parts";
import { EmptyState } from "@/components/app/page-header";
import type { BasisKey } from "@/lib/labels";

interface Item {
  text: string;
  basis: BasisKey;
  references: string[];
}

interface InterpretationContent {
  situazione: string;
  positivita: Item[];
  criticita: Item[];
  variazioni_rilevanti: Item[];
  possibili_rischi: Item[];
  possibili_azioni: Item[];
  model?: string;
  provider?: string;
  statementYears?: number[];
}

const SECTIONS: { key: keyof Omit<InterpretationContent, "situazione" | "model" | "provider" | "statementYears">; title: string; tone: string }[] = [
  { key: "positivita", title: "Positività", tone: "border-emerald-200" },
  { key: "criticita", title: "Criticità", tone: "border-red-200" },
  { key: "variazioni_rilevanti", title: "Variazioni rilevanti", tone: "border-sky-200" },
  { key: "possibili_rischi", title: "Possibili rischi", tone: "border-amber-200" },
];

export function InterpretationPanel({
  companyId,
  insight,
  aiConfigured,
  hasStatements,
}: {
  companyId: string;
  insight: { content: unknown; createdAt: Date | string } | null;
  aiConfigured: boolean;
  hasStatements: boolean;
}) {
  const { pending, error, run } = useAIAction(`/api/companies/${companyId}/interpretation`, "Interpretazione generata");
  const content = insight?.content as InterpretationContent | undefined;

  return (
    <div className="space-y-4 p-4" data-testid="interpretation-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BasisLegend />
        {aiConfigured && hasStatements && <GenerateButton pending={pending} onClick={run} hasResult={Boolean(content)} label="Genera interpretazione" />}
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {!content ? (
        <EmptyState
          icon={<Sparkles />}
          title={!hasStatements ? "Nessun bilancio da interpretare" : aiConfigured ? "Nessuna interpretazione generata" : "AI non configurata"}
          description={
            !hasStatements
              ? "Carica un bilancio: i dati vengono estratti e gli indicatori calcolati automaticamente."
              : aiConfigured
                ? "L'AI legge dati e indicatori calcolati dal sistema e produce una lettura strutturata, distinguendo dati, calcoli, interpretazioni e ipotesi."
                : "Configura ANTHROPIC_API_KEY o OPENAI_API_KEY per abilitare l'interpretazione."
          }
        />
      ) : (
        <>
          <div className="rounded-md border-l-4 border-primary/60 bg-muted/40 px-3 py-2">
            <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Situazione</div>
            <p className="text-sm leading-relaxed">{content.situazione}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {SECTIONS.map((section) => (
              <div key={section.key} className={`rounded-md border-l-2 bg-card px-3 py-2 ${section.tone}`}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</div>
                <ItemList items={content[section.key].map((i) => ({ text: i.text, basis: i.basis, refs: i.references }))} />
              </div>
            ))}
          </div>
          <div className="rounded-md border border-violet-200/70 bg-violet-50/30 px-3 py-2">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">Possibili azioni</div>
            <ul className="space-y-1">
              {content.possibili_azioni.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-[13px]">
                  <span>{a.text}</span>
                  <CreateTaskButton title={a.text} companyId={companyId} description="Azione emersa dall'interpretazione finanziaria AI" />
                </li>
              ))}
            </ul>
          </div>
          <AIMeta model={content.model} provider={content.provider} createdAt={insight!.createdAt} />
        </>
      )}
    </div>
  );
}
