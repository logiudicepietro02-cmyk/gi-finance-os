"use client";

import { FileText, Printer } from "lucide-react";
import { AIMeta, BasisLegend, CreateTaskButton, GenerateButton, ItemList, SourcesList, useAIAction, type SourceRef } from "@/components/ai/ai-insight-parts";
import { PriorityBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import type { BasisKey, TaskPriorityKey } from "@/lib/labels";

interface SourcedItem {
  text: string;
  basis: BasisKey;
  source_ids: string[];
}

interface BriefingContent {
  executive_summary: string;
  financial_position: string;
  key_changes: SourcedItem[];
  risks: SourcedItem[];
  open_operations: SourcedItem[];
  missing_information: SourcedItem[];
  recommended_questions: string[];
  next_actions: { title: string; reason: string; priority: TaskPriorityKey; source_ids: string[] }[];
  model?: string;
  provider?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

const toItems = (items: SourcedItem[]) => items.map((i) => ({ text: i.text, basis: i.basis, refs: i.source_ids }));

export function BriefingView({
  companyId,
  companyName,
  insight,
  aiConfigured,
}: {
  companyId: string;
  companyName: string;
  insight: { content: unknown; sourceRefs: unknown; createdAt: Date | string } | null;
  aiConfigured: boolean;
}) {
  const { pending, error, run } = useAIAction(`/api/companies/${companyId}/briefing`, "Briefing cliente generato");
  const content = insight?.content as BriefingContent | undefined;
  const sources = (insight?.sourceRefs as SourceRef[] | undefined) ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="briefing-view">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted-foreground">
          Il sistema raccoglie anagrafica, bilanci e indicatori, variazioni, operazioni, task, alert e documenti recenti; l&apos;AI prepara il briefing citando le fonti.
        </p>
        <div className="flex gap-2">
          {content && (
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer /> Stampa
            </Button>
          )}
          {aiConfigured && <GenerateButton pending={pending} onClick={run} hasResult={Boolean(content)} label="Genera briefing" />}
        </div>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {!content ? (
        <EmptyState
          icon={<FileText />}
          title={aiConfigured ? "Nessun briefing generato" : "AI non configurata"}
          description={aiConfigured ? `Genera il briefing per il prossimo incontro con ${companyName}.` : "Configura un provider AI per generare il briefing cliente."}
        />
      ) : (
        <article className="space-y-5">
          <header className="border-b pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Briefing incontro cliente</p>
            <h2 className="text-lg font-semibold">{companyName}</h2>
            <AIMeta model={content.model} provider={content.provider} createdAt={insight!.createdAt} />
          </header>
          <Section title="Executive summary">
            <p className="text-sm leading-relaxed">{content.executive_summary}</p>
          </Section>
          <Section title="Posizione finanziaria">
            <p className="text-sm leading-relaxed">{content.financial_position}</p>
          </Section>
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Cambiamenti chiave">
              <ItemList items={toItems(content.key_changes)} />
            </Section>
            <Section title="Rischi">
              <ItemList items={toItems(content.risks)} />
            </Section>
            <Section title="Operazioni aperte">
              <ItemList items={toItems(content.open_operations)} />
            </Section>
            <Section title="Informazioni mancanti">
              <ItemList items={toItems(content.missing_information)} />
            </Section>
          </div>
          <Section title="Domande consigliate per l'imprenditore">
            <ol className="ml-4 list-decimal space-y-1 text-[13px]">
              {content.recommended_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </Section>
          <Section title="Prossime azioni">
            <ul className="divide-y rounded-md border">
              {content.next_actions.map((a, i) => (
                <li key={i} className="flex items-start gap-3 px-3 py-2">
                  <PriorityBadge priority={a.priority} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.reason}
                      {a.source_ids.length > 0 && <span className="ml-1 font-mono text-[10px]">[{a.source_ids.join(", ")}]</span>}
                    </div>
                  </div>
                  <span className="print:hidden">
                    <CreateTaskButton title={a.title} description={a.reason} companyId={companyId} priority={a.priority} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <div className="border-t pt-3">
            <BasisLegend />
            <div className="mt-3">
              <SourcesList sources={sources} />
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
