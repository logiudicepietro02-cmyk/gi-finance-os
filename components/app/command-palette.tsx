"use client";

import { Building2, CheckSquare, FilePlus2, FileText, Landmark, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_ITEMS } from "@/components/app/app-sidebar";
import { OPEN_PALETTE_EVENT } from "@/components/app/topbar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { api } from "@/lib/client/api";
import { DOCUMENT_TYPE_LABELS, type DocumentTypeKey } from "@/lib/documents/types";
import { OPERATION_STATUS_LABELS, TASK_STATUS_LABELS, type OperationStatusKey, type TaskStatusKey } from "@/lib/labels";

interface SearchResults {
  companies: { id: string; name: string; city: string | null; vatNumber: string | null }[];
  operations: { id: string; title: string; bank: string; status: OperationStatusKey; company: { name: string } }[];
  documents: { id: string; fileName: string; type: DocumentTypeKey; company: { name: string } | null }[];
  tasks: { id: string; title: string; status: TaskStatusKey; company: { name: string } | null }[];
}

const GO_SHORTCUTS: Record<string, string> = {
  d: "/dashboard",
  c: "/companies",
  o: "/operations",
  f: "/documents",
  t: "/tasks",
  a: "/ai",
  l: "/activity",
  s: "/settings",
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; data: SearchResults } | null>(null);
  const gPressedAt = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing = !!target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (Date.now() - gPressedAt.current < 1200) {
        gPressedAt.current = 0;
        const href = GO_SHORTCUTS[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (e.key === "g") gPressedAt.current = Date.now();
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, [router]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((data) => setResults({ q, data }))
        .catch(() => undefined);
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const q = query.trim().toLowerCase();
  const found = q.length >= 2 && results?.q.toLowerCase() === q ? results.data : null;
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const actions = [
    { label: "Nuova azienda", icon: Building2, href: "/companies?new=1" },
    { label: "Nuova operazione finanziaria", icon: Landmark, href: "/operations?new=1" },
    { label: "Nuovo task", icon: Plus, href: "/tasks?new=1" },
    { label: "Carica documento", icon: FilePlus2, href: "/documents?upload=1" },
    { label: q ? `Chiedi al Copilot: “${query.trim()}”` : "Chiedi al Copilot", icon: Sparkles, href: q ? `/ai?q=${encodeURIComponent(query.trim())}` : "/ai", always: true },
  ].filter((a) => a.always || matches(a.label));
  const nav = NAV_ITEMS.filter((n) => matches(n.label));

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      title="Cerca e azioni"
      description="Cerca aziende, operazioni, documenti e task oppure esegui un'azione rapida"
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder="Cerca o digita un comando…" value={query} onValueChange={setQuery} data-testid="command-input" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>Nessun risultato.</CommandEmpty>

          {found && found.companies.length > 0 && (
            <CommandGroup heading="Aziende">
              {found.companies.map((c) => (
                <CommandItem key={c.id} value={`company-${c.id}`} onSelect={() => go(`/companies/${c.id}`)}>
                  <Building2 />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{c.city ?? c.vatNumber}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {found && found.operations.length > 0 && (
            <CommandGroup heading="Operazioni">
              {found.operations.map((o) => (
                <CommandItem key={o.id} value={`op-${o.id}`} onSelect={() => go(`/operations/${o.id}`)}>
                  <Landmark />
                  <span className="truncate">
                    {o.title} · {o.company.name}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{OPERATION_STATUS_LABELS[o.status]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {found && found.documents.length > 0 && (
            <CommandGroup heading="Documenti">
              {found.documents.map((d) => (
                <CommandItem key={d.id} value={`doc-${d.id}`} onSelect={() => go(`/documents/${d.id}`)}>
                  <FileText />
                  <span className="truncate">{d.fileName}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[d.type]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {found && found.tasks.length > 0 && (
            <CommandGroup heading="Task">
              {found.tasks.map((t) => (
                <CommandItem key={t.id} value={`task-${t.id}`} onSelect={() => go(`/tasks?q=${encodeURIComponent(t.title)}&view=all`)}>
                  <CheckSquare />
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{TASK_STATUS_LABELS[t.status]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {actions.length > 0 && (
            <>
              {found && <CommandSeparator />}
              <CommandGroup heading="Azioni rapide">
                {actions.map((a) => (
                  <CommandItem key={a.label} value={`action-${a.label}`} onSelect={() => go(a.href)}>
                    <a.icon />
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {nav.length > 0 && (
            <CommandGroup heading="Vai a">
              {nav.map((n) => (
                <CommandItem key={n.href} value={`nav-${n.href}`} onSelect={() => go(n.href)}>
                  <n.icon />
                  {n.label}
                  <CommandShortcut>{n.shortcut}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
