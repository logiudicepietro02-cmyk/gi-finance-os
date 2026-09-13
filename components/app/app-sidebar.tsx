"use client";

import {
  Building2,
  CheckSquare,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { href: "/companies", label: "Aziende", icon: Building2, shortcut: "G C" },
  { href: "/operations", label: "Operazioni", icon: Landmark, shortcut: "G O" },
  { href: "/documents", label: "Documenti", icon: FileText, shortcut: "G F" },
  { href: "/tasks", label: "Task", icon: CheckSquare, shortcut: "G T" },
  { href: "/ai", label: "AI Copilot", icon: Sparkles, shortcut: "G A" },
  { href: "/activity", label: "Attività", icon: History, shortcut: "G L" },
  { href: "/settings", label: "Impostazioni", icon: Settings, shortcut: "G S" },
] as const;

export function AppSidebar({ organizationName }: { organizationName: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-[224px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex print:hidden">
      <Link href="/dashboard" className="flex h-14 items-center gap-2.5 px-4">
        <div className="grid size-7 place-items-center rounded-md bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground">GI</div>
        <div className="leading-tight">
          <div className="text-[12px] font-semibold tracking-[0.16em] text-white">GI FINANCE OS</div>
          <div className="max-w-[150px] truncate text-[11px] text-sidebar-foreground/60">{organizationName}</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="Navigazione principale">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
              )}
            >
              {active && <span className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-sidebar-primary" />}
              <Icon className={cn("size-4", active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/55">
        <kbd className="rounded border border-sidebar-border px-1 font-mono">Ctrl</kbd> <kbd className="rounded border border-sidebar-border px-1 font-mono">K</kbd> cerca e azioni
      </div>
    </aside>
  );
}
