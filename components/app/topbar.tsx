"use client";

import { LogOut, Search, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AIStatus } from "@/lib/ai";
import { api } from "@/lib/client/api";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const OPEN_PALETTE_EVENT = "gifos:open-command-palette";

export function Topbar({ user, ai }: { user: { name: string; email: string; role: RoleKey; organizationName: string }; ai: AIStatus }) {
  const router = useRouter();
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function logout() {
    await api("/api/auth/logout", { method: "POST", redirectOn401: false }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card/80 px-6 backdrop-blur print:hidden">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border bg-background px-2.5 text-left text-sm text-muted-foreground transition hover:border-primary/30"
        data-testid="open-command-palette"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Cerca aziende, operazioni, documenti, task…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/settings#ai"
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                ai.configured
                  ? ai.isTestProvider
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <Sparkles className="size-3.5" />
              {ai.configured ? (ai.isTestProvider ? "Provider di test" : ai.model) : "AI non configurata"}
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            {ai.configured ? `Provider: ${ai.provider} · modello ${ai.model}` : (ai.reason ?? "Configura un provider AI nelle variabili d'ambiente")}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted" data-testid="user-menu">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{initials}</span>
            <span className="hidden text-left leading-tight lg:block">
              <span className="block text-[13px] font-medium">{user.name}</span>
              <span className="block text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {ROLE_LABELS[user.role]} · {user.organizationName}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings /> Impostazioni
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={logout} data-testid="logout">
              <LogOut /> Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
