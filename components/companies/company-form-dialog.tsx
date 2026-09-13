"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorText } from "@/lib/client/api";
import { COMPANY_STATUSES, COMPANY_STATUS_LABELS } from "@/lib/labels";

export interface CompanyFormValues {
  id?: string;
  name?: string;
  legalForm?: string | null;
  vatNumber?: string | null;
  sector?: string | null;
  atecoCode?: string | null;
  city?: string | null;
  province?: string | null;
  employees?: number | null;
  declaredRevenue?: number | null;
  status?: string;
  assignedAdvisorId?: string | null;
  description?: string | null;
}

export function CompanyFormDialog({
  users,
  initial,
  defaultOpen = false,
  trigger,
}: {
  users: { id: string; name: string }[];
  initial?: CompanyFormValues;
  defaultOpen?: boolean;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [advisor, setAdvisor] = useState(initial?.assignedAdvisorId ?? "none");
  const editing = Boolean(initial?.id);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      ...Object.fromEntries(form.entries()),
      status,
      assignedAdvisorId: advisor === "none" ? null : advisor,
    };
    setError(null);
    startTransition(async () => {
      try {
        const company = await api<{ id: string }>(editing ? `/api/companies/${initial!.id}` : "/api/companies", {
          method: editing ? "PATCH" : "POST",
          body,
        });
        toast.success(editing ? "Azienda aggiornata" : "Azienda creata");
        setOpen(false);
        if (editing) router.refresh();
        else router.push(`/companies/${company.id}`);
      } catch (err) {
        setError(errorText(err));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" data-testid="new-company">
            <Plus /> Nuova azienda
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica azienda" : "Nuova azienda cliente"}</DialogTitle>
          <DialogDescription>Anagrafica di base: i dati finanziari arrivano dai bilanci caricati.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" id="company-form">
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="name">Ragione sociale *</Label>
              <Input id="name" name="name" defaultValue={initial?.name} required autoFocus />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="legalForm">Forma giuridica</Label>
              <Input id="legalForm" name="legalForm" defaultValue={initial?.legalForm ?? ""} placeholder="S.r.l." />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="vatNumber">Partita IVA</Label>
              <Input id="vatNumber" name="vatNumber" defaultValue={initial?.vatNumber ?? ""} inputMode="numeric" placeholder="11 cifre" />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="sector">Settore</Label>
              <Input id="sector" name="sector" defaultValue={initial?.sector ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="atecoCode">Codice ATECO</Label>
              <Input id="atecoCode" name="atecoCode" defaultValue={initial?.atecoCode ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="city">Sede (città)</Label>
              <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="province">Prov.</Label>
              <Input id="province" name="province" defaultValue={initial?.province ?? ""} maxLength={5} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="employees">Dipendenti</Label>
              <Input id="employees" name="employees" type="number" min={0} defaultValue={initial?.employees ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="declaredRevenue">Fatturato indicativo (€)</Label>
              <Input id="declaredRevenue" name="declaredRevenue" type="number" min={0} step="1000" defaultValue={initial?.declaredRevenue ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Stato cliente</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {COMPANY_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Consulente assegnato</Label>
              <Select value={advisor} onValueChange={setAdvisor}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assegnato</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-6">
              <Label htmlFor="description">Note</Label>
              <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} rows={2} />
            </div>
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} type="button">
            Annulla
          </Button>
          <Button type="submit" form="company-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {editing ? "Salva" : "Crea azienda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
