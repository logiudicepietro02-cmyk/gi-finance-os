import { Bot, Cog, User } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/page-header";
import { AUDIT_ACTION_LABELS } from "@/lib/audit";
import { formatDate } from "@/lib/financial/format";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  action: string;
  actorType: "USER" | "AI" | "SYSTEM";
  entityType: string;
  entityId: string | null;
  toolName: string | null;
  metadata: unknown;
  createdAt: Date | string;
  user: { name: string } | null;
  companyName?: string | null;
  companyId?: string | null;
}

const ENTITY_HREF: Record<string, (id: string) => string> = {
  Company: (id) => `/companies/${id}`,
  Document: (id) => `/documents/${id}`,
  FinancingOperation: (id) => `/operations/${id}`,
};

function describe(item: TimelineItem): string | null {
  const m = (item.metadata ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["title", "name", "fileName", "question"]) {
    if (typeof m[key] === "string") {
      parts.push(String(m[key]));
      break;
    }
  }
  if (typeof m.fiscalYear === "number") parts.push(`esercizio ${m.fiscalYear}`);
  if (m.from && m.to) parts.push(`${m.from} → ${m.to}`);
  if (item.toolName) parts.push(`tool ${item.toolName}${m.ok === false ? " (errore)" : ""}`);
  if (Array.isArray(m.editedFields) && m.editedFields.length) parts.push(`campi modificati: ${m.editedFields.join(", ")}`);
  if (typeof m.appliedAction === "string") parts.push(String(m.appliedAction).toLowerCase().replace(/_/g, " "));
  return parts.length ? parts.join(" · ") : null;
}

export function Timeline({ items, showCompany = false }: { items: TimelineItem[]; showCompany?: boolean }) {
  if (items.length === 0) return <EmptyState title="Nessuna attività registrata" />;
  const groups = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const key = formatDate(item.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="space-y-4" data-testid="timeline">
      {[...groups.entries()].map(([day, dayItems]) => (
        <div key={day}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
          <ol className="relative space-y-0 border-l pl-4">
            {dayItems.map((item) => {
              const Icon = item.actorType === "AI" ? Bot : item.actorType === "SYSTEM" ? Cog : User;
              const href = item.entityId ? ENTITY_HREF[item.entityType]?.(item.entityId) : undefined;
              const detail = describe(item);
              return (
                <li key={item.id} className="relative py-1.5">
                  <span
                    className={cn(
                      "absolute top-2 -left-[25px] grid size-4 place-items-center rounded-full border bg-card",
                      item.actorType === "AI" && "border-violet-300 text-violet-600",
                      item.actorType === "SYSTEM" && "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-2.5" />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    <span className="font-medium">{AUDIT_ACTION_LABELS[item.action] ?? item.action}</span>
                    {detail &&
                      (href ? (
                        <Link href={href} className="truncate text-muted-foreground hover:text-primary hover:underline">
                          {detail}
                        </Link>
                      ) : (
                        <span className="truncate text-muted-foreground">{detail}</span>
                      ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {item.actorType === "AI" ? "AI" : item.actorType === "SYSTEM" ? "Sistema" : (item.user?.name ?? "Utente")}
                    {showCompany && item.companyName && item.companyId && (
                      <>
                        {" · "}
                        <Link href={`/companies/${item.companyId}`} className="hover:underline">
                          {item.companyName}
                        </Link>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
