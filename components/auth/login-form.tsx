"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorText } from "@/lib/client/api";

const DEMO_ACCOUNTS = [
  { label: "Owner", email: "giulia.ferri@gifinance.demo" },
  { label: "Advisor", email: "marco.bellini@gifinance.demo" },
  { label: "Analyst", email: "sara.colombo@gifinance.demo" },
];

export function LoginForm({ next, showDemoAccounts }: { next?: string; showDemoAccounts: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await api("/api/auth/login", { body: { email, password }, redirectOn401: false });
        const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
        router.replace(target);
        router.refresh();
      } catch (err) {
        setError(errorText(err));
      }
    });
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-1.5">
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <div className="grid size-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">GI</div>
          <span className="text-sm font-semibold tracking-[0.16em]">GI FINANCE OS</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Accedi</h2>
        <p className="text-sm text-muted-foreground">Usa le credenziali della tua organizzazione.</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-10" />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-10 w-full" disabled={pending || !email || !password}>
          {pending && <Loader2 className="animate-spin" />}
          Accedi
        </Button>
      </form>

      {showDemoAccounts && (
        <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-xs text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Ambiente dimostrativo</p>
          <p className="mb-3">Password: <code className="rounded bg-background px-1 py-0.5 text-foreground">GiFinance2026!</code></p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("GiFinance2026!");
                }}
                className="rounded-md border bg-background px-2 py-1 text-foreground transition hover:border-primary/40 hover:text-primary"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
