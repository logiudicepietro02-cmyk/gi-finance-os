"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { StatTile } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorText } from "@/lib/client/api";
import { toIsoDate } from "@/lib/dates";
import { netFeeAmount, netMonthlyRetainer } from "@/lib/economics/fee";
import { toNumber } from "@/lib/financial/fields";
import { formatCurrency, formatNumber } from "@/lib/financial/format";
import {
  DISCOUNT_TYPE_LABELS,
  FEE_TYPE_LABELS,
  OPERATION_SOURCES,
  OPERATION_SOURCE_LABELS,
  OPERATION_STATUSES,
  OPERATION_STATUS_LABELS,
  OPERATION_TYPES,
  OPERATION_TYPE_LABELS,
} from "@/lib/labels";

export interface OperationFormInitial {
  id: string;
  companyId: string;
  title: string;
  bank: string;
  type: string;
  status: string;
  source: string;
  sourceDetail: string | null;
  amount: number | null;
  outstandingDebt: number | null;
  rate: number | null;
  rateType: string | null;
  durationMonths: number | null;
  startDate: Date | string | null;
  maturityDate: Date | string | null;
  probability: number | null;
  guarantee: string | null;
  notes: string | null;
  feeType: string | null;
  feeValue: number | null;
  feeDiscountType: string | null;
  feeDiscountValue: number | null;
  monthlyRetainer: number | null;
  retainerActive: boolean;
  retainerStartDate: Date | string | null;
  retainerEndDate: Date | string | null;
  retainerDiscountType: string | null;
  retainerDiscountValue: number | null;
}

const dateValue = (d: Date | string | null | undefined) => (d ? toIsoDate(typeof d === "string" ? new Date(d) : d) ?? "" : "");
const numValue = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold text-muted-foreground">{children}</h3>;
}

export function OperationFormDialog({
  companies,
  defaultCompanyId,
  initial,
  defaultOpen = false,
}: {
  companies: { id: string; name: string }[];
  defaultCompanyId?: string;
  initial?: OperationFormInitial;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? defaultCompanyId ?? "");
  const [type, setType] = useState(initial?.type ?? "MUTUO_CHIROGRAFARIO");
  const [status, setStatus] = useState(initial?.status ?? "LEAD");
  const [source, setSource] = useState(initial?.source ?? "CLIENTE_PROPRIO");
  const [rateType, setRateType] = useState(initial?.rateType ?? "none");
  const [withChecklist, setWithChecklist] = useState(true);
  const [feeType, setFeeType] = useState(initial?.feeType ?? "none");
  const [feeDiscountType, setFeeDiscountType] = useState(initial?.feeDiscountType ?? "none");
  const [retainerDiscountType, setRetainerDiscountType] = useState(initial?.retainerDiscountType ?? "none");
  const [retainerActive, setRetainerActive] = useState(initial?.retainerActive ?? false);

  // Controlled fields feeding the live preview below.
  const [amount, setAmount] = useState(numValue(initial?.amount));
  const [rate, setRate] = useState(numValue(initial?.rate));
  const [durationMonths, setDurationMonths] = useState(numValue(initial?.durationMonths));
  const [feeValue, setFeeValue] = useState(numValue(initial?.feeValue));
  const [feeDiscountValue, setFeeDiscountValue] = useState(numValue(initial?.feeDiscountValue));
  const [monthlyRetainer, setMonthlyRetainer] = useState(numValue(initial?.monthlyRetainer));
  const [retainerDiscountValue, setRetainerDiscountValue] = useState(numValue(initial?.retainerDiscountValue));

  const netFee = useMemo(
    () =>
      netFeeAmount({
        amount,
        feeType: feeType === "none" ? null : (feeType as "FIXED" | "PERCENTAGE"),
        feeValue,
        feeDiscountType: feeDiscountType === "none" ? null : (feeDiscountType as "PERCENTAGE" | "FIXED"),
        feeDiscountValue,
      }),
    [amount, feeType, feeValue, feeDiscountType, feeDiscountValue],
  );
  const netRetainer = useMemo(
    () =>
      netMonthlyRetainer({
        monthlyRetainer,
        retainerDiscountType: retainerDiscountType === "none" ? null : (retainerDiscountType as "PERCENTAGE" | "FIXED"),
        retainerDiscountValue,
      }),
    [monthlyRetainer, retainerDiscountType, retainerDiscountValue],
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      ...Object.fromEntries(form.entries()),
      type,
      status,
      source,
      rateType: rateType === "none" ? null : rateType,
      feeType: feeType === "none" ? null : feeType,
      feeDiscountType: feeDiscountType === "none" ? null : feeDiscountType,
      retainerDiscountType: retainerDiscountType === "none" ? null : retainerDiscountType,
      retainerActive,
    };
    if (!editing) {
      body.companyId = companyId;
      body.withChecklist = withChecklist;
    }
    setError(null);
    startTransition(async () => {
      try {
        const op = await api<{ id: string }>(editing ? `/api/operations/${initial!.id}` : "/api/operations", { method: editing ? "PATCH" : "POST", body });
        toast.success(editing ? "Operazione aggiornata" : "Operazione creata con checklist documentale");
        setOpen(false);
        if (editing) router.refresh();
        else router.push(`/operations/${op.id}`);
      } catch (err) {
        setError(errorText(err));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button size="sm" variant="outline">
            <Pencil /> Modifica
          </Button>
        ) : (
          <Button size="sm" data-testid="new-operation">
            <Plus /> Nuova operazione
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{editing ? "Modifica operazione" : "Nuova operazione finanziaria"}</DialogTitle>
          <DialogDescription>{editing ? "Aggiorna condizioni e stato." : "La checklist dei documenti richiesti viene creata in base al tipo e collegata ai documenti già presenti."}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <form id="operation-form" onSubmit={submit} className="space-y-4">
            <section className="rounded-lg border bg-card/50 p-3">
              <SectionHeading>Azienda e titolo</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-6">
                {!editing && (
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label>Azienda *</Label>
                    <Select value={companyId} onValueChange={setCompanyId}>
                      <SelectTrigger className="w-full" data-testid="operation-company">
                        <SelectValue placeholder="Seleziona azienda" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className={editing ? "space-y-1.5 sm:col-span-6" : "space-y-1.5 sm:col-span-3"}>
                  <Label htmlFor="op-title">Titolo *</Label>
                  <Input id="op-title" name="title" defaultValue={initial?.title} required />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="op-bank">Banca / intermediario *</Label>
                  <Input id="op-bank" name="bank" defaultValue={initial?.bank} required />
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card/50 p-3">
              <SectionHeading>Condizioni del finanziamento</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-6">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {OPERATION_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-amount">Importo (€)</Label>
                  <Input id="op-amount" name="amount" type="number" min={0} step="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="op-outstanding">Debito residuo (€)</Label>
                  <Input id="op-outstanding" name="outstandingDebt" type="number" min={0} step="1000" defaultValue={initial?.outstandingDebt ?? ""} />
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="op-rate">Tasso %</Label>
                  <Input id="op-rate" name="rate" type="number" min={0} max={100} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>Tipo tasso</Label>
                  <Select value={rateType} onValueChange={setRateType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="FIXED">Fisso</SelectItem>
                      <SelectItem value="VARIABLE">Variabile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-duration">Durata (mesi)</Label>
                  <Input id="op-duration" name="durationMonths" type="number" min={0} value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-start">Data inizio</Label>
                  <Input id="op-start" name="startDate" type="date" defaultValue={dateValue(initial?.startDate)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-maturity">Scadenza</Label>
                  <Input id="op-maturity" name="maturityDate" type="date" defaultValue={dateValue(initial?.maturityDate)} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card/50 p-3">
              <SectionHeading>Stato e provenienza</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-6">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Stato</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {OPERATION_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Provenienza</Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="w-full" data-testid="operation-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATION_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {OPERATION_SOURCE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {source === "ALTRO" && (
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label htmlFor="op-source-detail">Specifica provenienza</Label>
                    <Input id="op-source-detail" name="sourceDetail" defaultValue={initial?.sourceDetail ?? ""} placeholder="Es. nome dello studio o del segnalatore" />
                  </div>
                )}
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="op-prob">Prob. %</Label>
                  <Input id="op-prob" name="probability" type="number" min={0} max={100} defaultValue={initial?.probability ?? ""} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-guarantee">Garanzia</Label>
                  <Input id="op-guarantee" name="guarantee" defaultValue={initial?.guarantee ?? ""} />
                </div>
                <div className="space-y-1.5 sm:col-span-6">
                  <Label htmlFor="op-notes">Note</Label>
                  <Textarea id="op-notes" name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card/50 p-3">
              <SectionHeading>Dati economici dello studio</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-6">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Tipo fee di mediazione</Label>
                  <Select value={feeType} onValueChange={setFeeType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="FIXED">{FEE_TYPE_LABELS.FIXED}</SelectItem>
                      <SelectItem value="PERCENTAGE">{FEE_TYPE_LABELS.PERCENTAGE}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="op-fee-value">Fee di mediazione</Label>
                  <Input id="op-fee-value" name="feeValue" type="number" min={0} step="0.01" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Tipo sconto fee</Label>
                  <Select value={feeDiscountType} onValueChange={setFeeDiscountType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="PERCENTAGE">{DISCOUNT_TYPE_LABELS.PERCENTAGE}</SelectItem>
                      <SelectItem value="FIXED">{DISCOUNT_TYPE_LABELS.FIXED}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="op-fee-discount-value">Valore sconto fee</Label>
                  <Input
                    id="op-fee-discount-value"
                    name="feeDiscountValue"
                    type="number"
                    min={0}
                    step="0.01"
                    value={feeDiscountValue}
                    onChange={(e) => setFeeDiscountValue(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-retainer">Retainer mensile (€/mese)</Label>
                  <Input id="op-retainer" name="monthlyRetainer" type="number" min={0} step="1" value={monthlyRetainer} onChange={(e) => setMonthlyRetainer(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-retainer-start">Retainer dal</Label>
                  <Input id="op-retainer-start" name="retainerStartDate" type="date" defaultValue={dateValue(initial?.retainerStartDate)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-retainer-end">Retainer al (se terminato)</Label>
                  <Input id="op-retainer-end" name="retainerEndDate" type="date" defaultValue={dateValue(initial?.retainerEndDate)} />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Tipo sconto retainer</Label>
                  <Select value={retainerDiscountType} onValueChange={setRetainerDiscountType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="PERCENTAGE">{DISCOUNT_TYPE_LABELS.PERCENTAGE}</SelectItem>
                      <SelectItem value="FIXED">{DISCOUNT_TYPE_LABELS.FIXED}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-retainer-discount-value">Valore sconto retainer</Label>
                  <Input
                    id="op-retainer-discount-value"
                    name="retainerDiscountValue"
                    type="number"
                    min={0}
                    step="0.01"
                    value={retainerDiscountValue}
                    onChange={(e) => setRetainerDiscountValue(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-1.5 text-sm sm:col-span-1">
                  <Checkbox checked={retainerActive} onCheckedChange={(v) => setRetainerActive(Boolean(v))} />
                  Attivo
                </label>
              </div>
            </section>

            {!editing && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={withChecklist} onCheckedChange={(v) => setWithChecklist(Boolean(v))} />
                Crea la checklist documentale standard per questo tipo di operazione
              </label>
            )}
          </form>
          {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        <div className="shrink-0 border-t bg-muted/30 px-6 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground">Riepilogo pratica</h3>
            <span className="text-[11px] text-muted-foreground">Si aggiorna mentre compili</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Importo pratica" value={toNumber(amount) !== null ? formatCurrency(toNumber(amount)) : "—"} />
            <StatTile label="Tasso" value={toNumber(rate) !== null ? `${formatNumber(toNumber(rate)!, 2)}%` : "—"} />
            <StatTile label="Durata" value={durationMonths ? `${durationMonths} mesi` : "—"} />
            <StatTile label="Fee netta" value={netFee !== null ? formatCurrency(netFee) : "—"} tone={netFee !== null && netFee > 0 ? "success" : "default"} />
            <StatTile label="Retainer netto" value={netRetainer !== null ? `${formatCurrency(netRetainer)} / mese` : "—"} tone={netRetainer !== null && netRetainer > 0 ? "success" : "default"} />
          </div>
        </div>

        <DialogFooter className="rounded-b-xl border-t bg-muted/50 px-6 py-4">
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button type="submit" form="operation-form" disabled={pending || (!editing && !companyId)} data-testid="submit-operation">
            {pending && <Loader2 className="animate-spin" />} {editing ? "Salva" : "Crea operazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
