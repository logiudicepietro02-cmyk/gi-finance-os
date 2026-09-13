"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SourceBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorText } from "@/lib/client/api";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";

export function DocumentMetaEditor({
  document,
  companies,
  canEdit,
  canDelete,
}: {
  document: { id: string; companyId: string | null; type: string; fiscalYear: number | null; typeSource: string | null; classificationConfidence: number | null; status: string };
  companies: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(document.companyId ?? "none");
  const [type, setType] = useState(document.type);
  const [fiscalYear, setFiscalYear] = useState(document.fiscalYear ? String(document.fiscalYear) : "");
  const [pending, startTransition] = useTransition();
  const dirty = companyId !== (document.companyId ?? "none") || type !== document.type || fiscalYear !== (document.fiscalYear ? String(document.fiscalYear) : "");

  function save() {
    startTransition(async () => {
      try {
        await api(`/api/documents/${document.id}`, {
          method: "PATCH",
          body: { companyId: companyId === "none" ? null : companyId, type, fiscalYear: fiscalYear || null },
        });
        toast.success(document.status === "PROCESSED" ? "Documento aggiornato: rielabora per applicare le modifiche ai dati" : "Documento aggiornato");
        router.refresh();
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  function remove() {
    if (!window.confirm("Eliminare definitivamente il documento e i dati estratti non verificati?")) return;
    startTransition(async () => {
      try {
        await api(`/api/documents/${document.id}`, { method: "DELETE" });
        toast.success("Documento eliminato");
        router.push("/documents");
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  }

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1.5">
        <Label>Azienda</Label>
        <Select value={companyId} onValueChange={setCompanyId} disabled={!canEdit}>
          <SelectTrigger className="w-full" data-testid="document-company">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Non associato</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Tipo
            {document.typeSource && <SourceBadge source={document.typeSource} />}
            {document.typeSource && document.typeSource !== "USER" && document.classificationConfidence !== null && (
              <span className="text-[11px] font-normal text-muted-foreground">{Math.round(document.classificationConfidence * 100)}%</span>
            )}
          </Label>
          <Select value={type} onValueChange={setType} disabled={!canEdit}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-year">Esercizio</Label>
          <Input id="doc-year" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} disabled={!canEdit} className="num" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {canDelete ? (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={remove} disabled={pending}>
            <Trash2 /> Elimina
          </Button>
        ) : (
          <span />
        )}
        {canEdit && (
          <Button size="sm" variant="outline" onClick={save} disabled={!dirty || pending}>
            {pending && <Loader2 className="animate-spin" />} Salva
          </Button>
        )}
      </div>
    </div>
  );
}
