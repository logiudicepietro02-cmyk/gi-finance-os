"use client";

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ExtractionStatusBadge, SourceBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText } from "@/lib/client/api";
import {
  BILANCIO_FIELD_KEYS,
  BILANCIO_FIELD_LABELS,
  EXTRACTION_TO_STATEMENT,
  type BilancioExtraction,
  type BilancioFieldKey,
} from "@/lib/documents/extraction-schema";
import type { StatementField } from "@/lib/financial/fields";
import { formatCurrency, formatDateTime } from "@/lib/financial/format";
import { APPLIED_ACTION_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface ExtractionView {
  id: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  method: string;
  appliedAction: string | null;
  fiscalYear: number | null;
  data: unknown;
  validation: unknown;
  confidence: number | null;
  createdAt: Date | string;
  reviewedAt: Date | string | null;
  reviewNotes: string | null;
  approvals: { id: string; status: string; title: string; payload: unknown }[];
}

const MAIN_KEYS = BILANCIO_FIELD_KEYS.filter((k) => EXTRACTION_TO_STATEMENT[k]);
const COMPONENT_KEYS: BilancioFieldKey[] = ["bank_debt", "other_lenders_debt", "bonds"];

export function ExtractionReview({ extraction, canApprove, hasCompany }: { extraction: ExtractionView; canApprove: boolean; hasCompany: boolean }) {
  const router = useRouter();
  const data = extraction.data as BilancioExtraction;
  const validation = (extraction.validation ?? { valid: true, errors: [], warnings: [] }) as { valid: boolean; errors: string[]; warnings: string[] };
  const pending = extraction.status === "PENDING_REVIEW";
  const editable = pending && canApprove;

  const original = useMemo(
    () => Object.fromEntries(MAIN_KEYS.map((k) => [k, data.fields[k].value === null ? "" : String(data.fields[k].value)])) as Record<string, string>,
    [data],
  );
  const [values, setValues] = useState<Record<string, string>>(original);
  const [fiscalYear, setFiscalYear] = useState(String(extraction.fiscalYear ?? data.fiscal_year ?? ""));
  const [notes, setNotes] = useState("");
  const [busy, startTransition] = useTransition();
  const proposal = extraction.approvals.find((a) => a.status === "PENDING");
  const changes = (proposal?.payload as { changes?: { field: string; label: string; current: number | null; proposed: number | null }[] } | undefined)?.changes ?? [];

  function decide(decision: "APPROVE" | "REJECT") {
    startTransition(async () => {
      try {
        const edited: Partial<Record<StatementField, number | null>> = {};
        for (const key of MAIN_KEYS) {
          if (values[key] !== original[key]) edited[EXTRACTION_TO_STATEMENT[key]!] = values[key] === "" ? null : Number(values[key]);
        }
        await api(`/api/extractions/${extraction.id}`, {
          body: {
            decision,
            notes: notes || null,
            ...(decision === "APPROVE" ? { values: edited, fiscalYear: fiscalYear ? Number(fiscalYear) : undefined } : {}),
          },
        });
        toast.success(decision === "APPROVE" ? "Dati approvati: bilancio verificato, indicatori e alert aggiornati" : "Estrazione rifiutata");
        router.refresh();
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  return (
    <div className="space-y-3 p-4" data-testid="extraction-review">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ExtractionStatusBadge status={extraction.status} />
        <SourceBadge source={extraction.method} />
        {extraction.confidence !== null && <span className="text-muted-foreground">confidenza media {Math.round(extraction.confidence * 100)}%</span>}
        {extraction.appliedAction && <span className="text-muted-foreground">· {APPLIED_ACTION_LABELS[extraction.appliedAction]}</span>}
      </div>

      {validation.errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <XCircle className="size-3.5" /> Errori di validazione
          </div>
          <ul className="ml-4 list-disc">{validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="size-3.5" /> Da verificare
          </div>
          <ul className="ml-4 list-disc">{validation.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {pending && changes.length > 0 && (
        <div className="rounded-md border border-violet-200 bg-violet-50/50 px-3 py-2 text-xs">
          <div className="mb-1 font-medium text-violet-800">{proposal?.title} — richiede approvazione</div>
          <table className="w-full">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-0.5 text-left font-normal">Voce</th>
                <th className="py-0.5 text-right font-normal">Attuale</th>
                <th className="py-0.5 text-right font-normal">Proposto</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.field}>
                  <td className="py-0.5">{c.label}</td>
                  <td className="num py-0.5 text-right">{formatCurrency(c.current)}</td>
                  <td className="num py-0.5 text-right font-medium">{formatCurrency(c.proposed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-muted-foreground">Esercizio</span>
        {editable ? <Input value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className="num h-7 w-24" type="number" /> : <span className="num font-medium">{fiscalYear || "—"}</span>}
        {data.source_unit === "thousands" && <span className="text-xs text-muted-foreground">(importi convertiti da migliaia)</span>}
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50">
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-1.5 text-left font-medium">Campo</th>
              <th className="px-3 py-1.5 text-right font-medium">Valore (€)</th>
              <th className="px-3 py-1.5 text-center font-medium">Pag.</th>
              <th className="px-3 py-1.5 text-left font-medium">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {MAIN_KEYS.map((key) => {
              const field = data.fields[key];
              const changed = values[key] !== original[key];
              return (
                <tr key={key} className="border-t">
                  <td className="px-3 py-1">{BILANCIO_FIELD_LABELS[key]}</td>
                  <td className="px-3 py-1 text-right">
                    {editable ? (
                      <Input
                        value={values[key]}
                        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                        type="number"
                        className={cn("num ml-auto h-7 w-36 text-right", changed && "border-primary bg-primary/5")}
                        aria-label={BILANCIO_FIELD_LABELS[key]}
                        placeholder="n.d."
                      />
                    ) : (
                      <span className={cn("num", field.value === null && "text-muted-foreground")}>{field.value === null ? "n.d." : formatCurrency(field.value)}</span>
                    )}
                  </td>
                  <td className="num px-3 py-1 text-center text-muted-foreground">{field.page ?? "—"}</td>
                  <td className="max-w-[180px] px-3 py-1">
                    {field.sourceText ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block cursor-help truncate text-xs text-muted-foreground">{field.sourceText}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm font-mono text-[11px]">
                          {field.sourceText}
                          {field.confidence !== null ? ` · confidenza ${Math.round(field.confidence * 100)}%` : ""}
                        </TooltipContent>
                      </Tooltip>
                    ) : key === "net_financial_position" && field.value === null ? (
                      <span className="text-xs text-muted-foreground">calcolata dal sistema</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {COMPONENT_KEYS.some((k) => data.fields[k].value !== null) && (
        <p className="text-xs text-muted-foreground">
          Componenti del debito:{" "}
          {COMPONENT_KEYS.filter((k) => data.fields[k].value !== null)
            .map((k) => `${BILANCIO_FIELD_LABELS[k]} ${formatCurrency(data.fields[k].value)}`)
            .join(" · ")}
        </p>
      )}
      {data.notes.length > 0 && (
        <ul className="ml-4 list-disc text-xs text-muted-foreground">
          {data.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {pending ? (
        canApprove ? (
          <div className="space-y-2 border-t pt-3">
            {!hasCompany && <p className="text-xs text-amber-700">Associa il documento a un&apos;azienda prima di approvare.</p>}
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note di revisione (opzionali)" rows={2} className="text-[13px]" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => decide("REJECT")} disabled={busy} data-testid="reject-extraction">
                <XCircle /> Rifiuta
              </Button>
              <Button size="sm" onClick={() => decide("APPROVE")} disabled={busy || !hasCompany} data-testid="approve-extraction">
                {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Approva dati
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Le modifiche manuali vengono registrate come tali nell&apos;audit log e nella fonte del dato.</p>
          </div>
        ) : (
          <p className="border-t pt-3 text-xs text-muted-foreground">In attesa di verifica da parte di un Advisor o Owner.</p>
        )
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Revisionata {extraction.reviewedAt ? formatDateTime(extraction.reviewedAt) : ""}
          {extraction.reviewNotes ? ` · ${extraction.reviewNotes}` : ""}
        </p>
      )}
    </div>
  );
}
