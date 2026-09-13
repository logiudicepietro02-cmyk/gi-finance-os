"use client";

import { Loader2, RefreshCw, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorText } from "@/lib/client/api";
import { formatDateTime } from "@/lib/financial/format";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions";

export function ThresholdsForm({ settings, canEdit }: { settings: { dscrMin: number; netDebtEbitdaMax: number; maturityWarningDays: number }; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    startTransition(async () => {
      try {
        const res = await api<{ alerts: { created: number; resolved: number } }>("/api/settings", { method: "PUT", body });
        toast.success(`Soglie salvate · alert ricalcolati (${res.alerts.created} nuovi, ${res.alerts.resolved} risolti)`);
        router.refresh();
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="dscrMin">DSCR minimo</Label>
        <Input id="dscrMin" name="dscrMin" type="number" step="0.05" min={0} max={10} defaultValue={settings.dscrMin} disabled={!canEdit} className="num" />
        <p className="text-[11px] text-muted-foreground">Alert se il DSCR dell&apos;ultimo bilancio è inferiore.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="netDebtEbitdaMax">PFN/EBITDA massimo</Label>
        <Input id="netDebtEbitdaMax" name="netDebtEbitdaMax" type="number" step="0.1" min={0} max={20} defaultValue={settings.netDebtEbitdaMax} disabled={!canEdit} className="num" />
        <p className="text-[11px] text-muted-foreground">Alert se la leva supera la soglia (critico oltre 1,5×).</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="maturityWarningDays">Preavviso scadenze (giorni)</Label>
        <Input id="maturityWarningDays" name="maturityWarningDays" type="number" min={1} max={365} defaultValue={settings.maturityWarningDays} disabled={!canEdit} className="num" />
        <p className="text-[11px] text-muted-foreground">Alert per finanziamenti in scadenza entro questo periodo.</p>
      </div>
      {canEdit && (
        <div className="sm:col-span-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Salva soglie
          </Button>
        </div>
      )}
    </form>
  );
}

export function RecalculateAlertsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const r = await api<{ total: number; created: number; resolved: number }>("/api/alerts", { method: "POST" });
            toast.success(`${r.total} alert attivi · ${r.created} nuovi · ${r.resolved} risolti`);
            router.refresh();
          } catch (error) {
            toast.error(errorText(error));
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Ricalcola alert
    </Button>
  );
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  isActive: boolean;
  lastLoginAt: Date | string | null;
}

export function UsersManager({ users, canManage, currentUserId }: { users: UserRow[]; canManage: boolean; currentUserId: string }) {
  const router = useRouter();
  const [role, setRole] = useState<RoleKey>("ANALYST");
  const [pending, startTransition] = useTransition();

  async function update(user: UserRow, body: Record<string, unknown>) {
    try {
      await api(`/api/users/${user.id}`, { method: "PATCH", body });
      toast.success("Utente aggiornato");
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const body = { ...Object.fromEntries(new FormData(formEl).entries()), role };
    startTransition(async () => {
      try {
        await api("/api/users", { body });
        toast.success("Utente creato: comunica la password in modo sicuro");
        formEl.reset();
        router.refresh();
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  return (
    <div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Utente</th>
            <th className="px-3 py-2 text-left font-medium">Ruolo</th>
            <th className="px-3 py-2 text-left font-medium">Ultimo accesso</th>
            <th className="px-4 py-2 text-right font-medium">Stato</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b last:border-0">
              <td className="px-4 py-2">
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </td>
              <td className="px-3 py-2">
                {canManage && u.id !== currentUserId ? (
                  <Select value={u.role} onValueChange={(v) => update(u, { role: v })}>
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABELS) as RoleKey[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Pill tone="primary">{ROLE_LABELS[u.role]}</Pill>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Mai"}</td>
              <td className="px-4 py-2 text-right">
                {canManage && u.id !== currentUserId ? (
                  <Button size="xs" variant="ghost" onClick={() => update(u, { isActive: !u.isActive })}>
                    {u.isActive ? "Disattiva" : "Riattiva"}
                  </Button>
                ) : (
                  <Pill tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Attivo" : "Disattivato"}</Pill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && (
        <form onSubmit={create} className="grid gap-2 border-t p-4 sm:grid-cols-[1fr_1fr_140px_1fr_auto]">
          <Input name="name" placeholder="Nome e cognome" required />
          <Input name="email" type="email" placeholder="Email" required />
          <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as RoleKey[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input name="password" type="password" placeholder="Password iniziale (min. 10)" minLength={10} required />
          <Button type="submit" size="default" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Aggiungi
          </Button>
        </form>
      )}
    </div>
  );
}
