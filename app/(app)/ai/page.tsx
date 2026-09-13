import { MessageSquarePlus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanyContextSelect, CopilotWorkspace } from "@/components/ai/copilot-workspace";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { getAIStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { relativeDayLabel } from "@/lib/dates";
import { NotFoundError } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { getConversation, listConversations } from "@/services/copilot";

export const metadata: Metadata = { title: "AI Copilot" };

export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ c?: string; company?: string; q?: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const sp = await searchParams;
  const ai = getAIStatus();
  const [conversations, companies] = await Promise.all([listConversations(ctx), listCompanies(ctx)]);

  let conversation = null;
  if (sp.c) {
    try {
      conversation = await getConversation(ctx, sp.c);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }
  const companyId = conversation?.companyId ?? (companies.some((c) => c.id === sp.company) ? sp.company! : null);
  const companyName = conversation?.company?.name ?? companies.find((c) => c.id === companyId)?.name ?? null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-5 text-violet-600" /> AI Copilot
          </span>
        }
        description="Analisi, confronti, operazioni e briefing: il copilot usa solo tool interni autorizzati e tracciati"
        actions={<CompanyContextSelect companies={companies.map((c) => ({ id: c.id, name: c.name }))} value={companyId} disabled={Boolean(conversation)} />}
      />
      <div className="grid h-[calc(100dvh-190px)] min-h-[520px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Panel
          title="Conversazioni"
          className="hidden min-h-0 flex-col lg:flex"
          bodyClassName="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
          action={
            <Link href={companyId && !conversation ? `/ai?company=${companyId}` : "/ai"} className="text-primary" aria-label="Nuova conversazione" title="Nuova conversazione">
              <MessageSquarePlus className="size-4" />
            </Link>
          }
        >
          {conversations.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">Nessuna conversazione.</p>
          ) : (
            <ul className="divide-y">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/ai?c=${c.id}`} className={cn("block px-3 py-2 hover:bg-muted/50", c.id === conversation?.id && "bg-muted")}>
                    <div className="truncate text-[13px] font-medium">{c.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {c.company?.name ?? "Studio"} · {relativeDayLabel(c.updatedAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="flex min-h-0 flex-col" bodyClassName="min-h-0 flex-1" title={companyName ? `Contesto: ${companyName}` : "Contesto: tutto lo studio"}>
          <CopilotWorkspace
            key={conversation?.id ?? `new-${companyId ?? "studio"}`}
            companyId={companyId}
            companyName={companyName}
            aiConfigured={ai.configured}
            aiReason={ai.reason}
            conversationId={conversation?.id ?? null}
            messages={conversation?.messages ?? []}
            initialQuestion={sp.q}
          />
        </Panel>
      </div>
    </>
  );
}
