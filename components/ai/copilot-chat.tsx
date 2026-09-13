"use client";

import { ArrowUp, Check, Loader2, Sparkles, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorText } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export interface ChatMessageView {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls?: unknown;
  sources?: unknown;
  createdAt: Date | string;
}

const TOOL_LABELS: Record<string, string> = {
  get_company: "Anagrafica",
  get_company_financials: "Bilanci e indicatori",
  get_company_documents: "Documenti",
  get_company_operations: "Operazioni",
  get_company_tasks: "Task",
  get_company_alerts: "Alert",
  calculate_financial_ratio: "Calcolo indicatore",
  search_company_knowledge: "Ricerca nei documenti",
  create_task: "Creazione task",
};

const COMPANY_SUGGESTIONS = [
  "Quali sono le principali criticità finanziarie?",
  "Confronta gli ultimi due bilanci.",
  "Quali KPI sono peggiorati?",
  "Quali operazioni finanziarie sono aperte e cosa manca per completarle?",
  "Preparami il briefing per il prossimo incontro.",
];

const GENERAL_SUGGESTIONS = [
  "Quali aziende hanno il DSCR sotto soglia?",
  "Analizza Alfa Meccanica.",
  "Quali operazioni di Beta Alimentare sono aperte?",
  "Cosa manca per completare il mutuo di Alfa Meccanica?",
];

export function CopilotChat({
  companyId,
  companyName,
  aiConfigured,
  aiReason,
  initialConversationId = null,
  initialMessages = [],
  initialQuestion,
  onConversationCreated,
  className,
}: {
  companyId?: string | null;
  companyName?: string | null;
  aiConfigured: boolean;
  aiReason?: string | null;
  initialConversationId?: string | null;
  initialMessages?: ChatMessageView[];
  initialQuestion?: string;
  onConversationCreated?: (id: string) => void;
  className?: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState(initialQuestion ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const localSeq = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    setPending(true);
    setInput("");
    localSeq.current += 1;
    const optimistic: ChatMessageView = { id: `local-${localSeq.current}`, role: "USER", content: message, createdAt: "" };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await api<{ conversationId: string; message: ChatMessageView }>("/api/copilot", {
        body: { conversationId, companyId: companyId ?? null, message },
      });
      if (!conversationId) {
        setConversationId(res.conversationId);
        onConversationCreated?.(res.conversationId);
      }
      setMessages((m) => [...m, res.message]);
    } catch (err) {
      setError(errorText(err));
      setInput(message);
    } finally {
      setPending(false);
    }
  }

  const suggestions = companyId ? COMPANY_SUGGESTIONS : GENERAL_SUGGESTIONS;

  return (
    <div className={cn("flex min-h-0 flex-col", className)} data-testid="copilot-chat">
      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-violet-600" />
              {companyName ? `Copilot su ${companyName}` : "Copilot dello studio"}
            </div>
            <p className="text-xs text-muted-foreground">
              Il copilot usa solo i tool interni (bilanci, indicatori calcolati, documenti, operazioni, task, alert) nei limiti dei tuoi permessi. Ogni chiamata è registrata.
            </p>
            {aiConfigured ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border bg-card px-2.5 py-1 text-left text-xs hover:border-primary/40 hover:text-primary">
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">AI non configurata. {aiReason}</p>
            )}
          </div>
        )}

        {messages.map((m) =>
          m.role === "USER" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground">{m.content}</div>
            </div>
          ) : (
            <AssistantMessage key={m.id} message={m} />
          ),
        )}

        {pending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="copilot-pending">
            <Loader2 className="size-3.5 animate-spin text-violet-600" /> Il copilot sta consultando i dati…
          </div>
        )}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:border-primary/40">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={aiConfigured ? (companyName ? `Chiedi qualcosa su ${companyName}…` : "Chiedi al copilot…") : "AI non configurata"}
            disabled={!aiConfigured}
            rows={1}
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 text-[13px] shadow-none focus-visible:ring-0"
            data-testid="copilot-input"
          />
          <Button type="submit" size="icon-sm" disabled={!aiConfigured || pending || !input.trim()} aria-label="Invia">
            {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">Invio per inviare · Maiusc+Invio per andare a capo · L&apos;AI non esegue azioni esterne.</p>
      </form>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessageView }) {
  const toolCalls = (message.toolCalls as { name: string; ok: boolean; error?: string | null }[] | null) ?? [];
  const sources = (message.sources as { id: string; label: string; href?: string | null }[] | null) ?? [];
  return (
    <div className="space-y-2" data-testid="copilot-answer">
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <Wrench className="size-3" />
          {toolCalls.map((t, i) => (
            <span key={`${t.name}-${i}`} title={t.error ?? undefined} className={cn("inline-flex items-center gap-0.5 rounded border px-1.5 py-px", !t.ok && "border-red-200 text-red-700")}>
              {t.ok ? <Check className="size-3 text-emerald-600" /> : <X className="size-3" />}
              {TOOL_LABELS[t.name] ?? t.name}
            </span>
          ))}
        </div>
      )}
      <div className="rounded-lg rounded-bl-sm border bg-card px-3 py-2.5">
        <Markdown>{message.content}</Markdown>
      </div>
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="font-medium">Fonti:</span>
          {sources.slice(0, 8).map((s) =>
            s.href ? (
              <Link key={s.id} href={s.href} className="text-primary hover:underline">
                {s.label}
              </Link>
            ) : (
              <span key={s.id}>{s.label}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
