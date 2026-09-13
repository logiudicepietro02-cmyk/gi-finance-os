"use client";

import { CheckCircle2, FileText, Loader2, MoreHorizontal, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SourceBadge, StatementStatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, errorText } from "@/lib/client/api";
import { FIELD_LABELS, STATEMENT_FIELDS, type StatementField, type StatementValues } from "@/lib/financial/fields";
import { formatCurrency, formatDateTime } from "@/lib/financial/format";
import { cn } from "@/lib/utils";

interface FieldSource {
  method: string;
  documentId?: string | null;
  page?: number | null;
  sourceText?: string | null;
  confidence?: number | null;
  formula?: string;
  at?: string;
}

export interface StatementRow {
  id: string;
  fiscalYear: number;
  status: "EXTRACTED" | "VERIFIED";
  values: StatementValues;
  fieldSources: Record<string, FieldSource>;
  sourceDocument: { id: string; fileName: string } | null;
  verifiedAt: Date | string | null;
}

const METHOD_DOT: Record<string, string> = {
  AI: "bg-violet-500",
  RULES: "bg-sky-500",
  MANUAL: "bg-primary",
  SEED: "bg-muted-foreground/50",
  COMPUTED: "bg-muted-foreground/50",
};

function SourcePopover({ value, source }: { value: number | null | undefined; source?: FieldSource }) {
  const text = value === null || value === undefined ? "—" : formatCurrency(value);
  if (!source || value === null || value === undefined) return <span className={cn("num", (value === null || value === undefined) && "text-muted-foreground")}>{text}</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="num inline-flex items-center gap-1.5 hover:underline decoration-dotted underline-offset-4">
          <span className={cn("size-1.5 rounded-full", METHOD_DOT[source.method] ?? "bg-muted-foreground")} />
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-xs" align="end">
        <div className="flex items-center gap-2">
          <span className="font-medium">Fonte del dato</span>
          <SourceBadge source={source.method} />
          {source.confidence !== null && source.confidence !== undefined && <span className="text-muted-foreground">confidenza {Math.round(source.confidence * 100)}%</span>}
        </div>
        {source.documentId && (
          <Link href={`/documents/${source.documentId}`} className="flex items-center gap-1 text-primary hover:underline">
            <FileText className="size-3.5" /> Apri documento{source.page ? ` · pagina ${source.page}` : ""}
          </Link>
        )}
        {source.sourceText && <blockquote className="rounded-md border-l-2 border-primary/40 bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed">{source.sourceText}</blockquote>}
        {source.formula && <p className="text-muted-foreground">Calcolato: {source.formula}</p>}
        {source.method === "MANUAL" && source.at && <p className="text-muted-foreground">Modificato manualmente il {formatDateTime(source.at)}</p>}
      </PopoverContent>
    </Popover>
  );
}

function StatementEditor({
  companyId,
  statement,
  open,
  onOpenChange,
}: {
  companyId: string;
  statement: StatementRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(STATEMENT_FIELDS.map((f) => [f, form.get(f) === "" ? null : form.get(f)]));
    setError(null);
    startTransition(async () => {
      try {
        if (statement) await api(`/api/statements/${statement.id}`, { method: "PATCH", body: { values } });
        else await api(`/api/companies/${companyId}/financials`, { body: { fiscalYear: form.get("fiscalYear"), values } });
        toast.success(statement ? "Bilancio aggiornato: indicatori e alert ricalcolati" : "Bilancio inserito");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(errorText(err));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{statement ? `Modifica bilancio ${statement.fiscalYear}` : "Inserisci bilancio manualmente"}</DialogTitle>
          <DialogDescription>Importi in euro. Lascia vuoto un campo se il dato non è disponibile: gli indicatori lo segnaleranno.</DialogDescription>
        </DialogHeader>
        <form id="statement-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          {!statement && (
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="fiscalYear">Esercizio</Label>
              <Input id="fiscalYear" name="fiscalYear" type="number" min={1990} max={2100} defaultValue={new Date().getFullYear() - 1} className="w-32" required />
            </div>
          )}
          {STATEMENT_FIELDS.map((f: StatementField) => (
            <div key={f} className="space-y-1">
              <Label htmlFor={`f-${f}`} className="text-xs">
                {FIELD_LABELS[f]}
              </Label>
              <Input id={`f-${f}`} name={f} type="number" step="1" defaultValue={statement?.values[f] ?? ""} className="num h-8" />
            </div>
          ))}
        </form>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button type="submit" form="statement-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatementsTable({
  companyId,
  statements,
  canWrite,
  canApprove,
}: {
  companyId: string;
  statements: StatementRow[];
  canWrite: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<StatementRow | null>(null);
  const [creating, setCreating] = useState(false);
  const years = statements.slice(-5);

  async function verify(s: StatementRow) {
    try {
      await api(`/api/statements/${s.id}`, { method: "POST" });
      toast.success(`Bilancio ${s.fiscalYear} verificato`);
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" data-testid="statements-table">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Voce (€)</th>
              {years.map((s) => {
                const editable = canWrite && (s.status === "EXTRACTED" || canApprove);
                return (
                  <th key={s.id} className="px-3 py-2 text-right font-medium">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="num text-foreground">{s.fiscalYear}</span>
                      <StatementStatusBadge status={s.status} />
                      {(editable || s.sourceDocument || (canApprove && s.status === "EXTRACTED")) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-xs" variant="ghost" aria-label={`Azioni bilancio ${s.fiscalYear}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canApprove && s.status === "EXTRACTED" && (
                              <DropdownMenuItem onSelect={() => verify(s)}>
                                <CheckCircle2 /> Segna come verificato
                              </DropdownMenuItem>
                            )}
                            {editable && (
                              <DropdownMenuItem onSelect={() => setEditing(s)}>
                                <Pencil /> Modifica valori
                              </DropdownMenuItem>
                            )}
                            {s.sourceDocument && (
                              <DropdownMenuItem asChild>
                                <Link href={`/documents/${s.sourceDocument.id}`}>
                                  <FileText /> Documento sorgente
                                </Link>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {STATEMENT_FIELDS.map((field) => (
              <tr key={field} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-1.5 text-muted-foreground">{FIELD_LABELS[field]}</td>
                {years.map((s) => (
                  <td key={s.id} className="px-3 py-1.5 text-right">
                    <SourcePopover value={s.values[field]} source={s.fieldSources[field]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-violet-500" /> AI</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-sky-500" /> Regole</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" /> Manuale</span>
          <span>Clicca un valore per vedere documento, pagina e testo sorgente.</span>
        </span>
        {canWrite && (
          <Button size="xs" variant="outline" onClick={() => setCreating(true)}>
            <Plus /> Inserisci bilancio
          </Button>
        )}
      </div>
      <StatementEditor companyId={companyId} statement={editing} open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} />
      <StatementEditor companyId={companyId} statement={null} open={creating} onOpenChange={setCreating} />
    </div>
  );
}
