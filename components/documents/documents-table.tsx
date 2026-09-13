import { FileText } from "lucide-react";
import Link from "next/link";
import { DocumentStatusBadge, ExtractionStatusBadge, Pill, SourceBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";
import { formatDate } from "@/lib/financial/format";
import { APPLIED_ACTION_LABELS } from "@/lib/labels";
import type { DocumentListItem } from "@/services/documents";

export function DocumentsTable({ documents, showCompany = true }: { documents: DocumentListItem[]; showCompany?: boolean }) {
  if (documents.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={<FileText />} title="Nessun documento" description="Carica un PDF: testo, tipo e dati vengono estratti automaticamente." />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" data-testid="documents-table">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Documento</th>
            {showCompany && <th className="px-3 py-2 text-left font-medium">Azienda</th>}
            <th className="px-3 py-2 text-left font-medium">Tipo</th>
            <th className="px-3 py-2 text-right font-medium">Esercizio</th>
            <th className="px-3 py-2 text-left font-medium">Analisi</th>
            <th className="px-3 py-2 text-left font-medium">Dati estratti</th>
            <th className="px-4 py-2 text-right font-medium">Caricato</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => {
            const extraction = d.extractions[0];
            return (
              <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="max-w-[320px] px-4 py-2">
                  <Link href={`/documents/${d.id}`} className="flex items-center gap-2 font-medium hover:text-primary hover:underline">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.fileName}</span>
                  </Link>
                  {d.pageCount ? <div className="pl-6 text-[11px] text-muted-foreground">{d.pageCount} pagine</div> : null}
                </td>
                {showCompany && (
                  <td className="px-3 py-2">
                    {d.company ? (
                      <Link href={`/companies/${d.company.id}`} className="hover:underline">
                        {d.company.name}
                      </Link>
                    ) : (
                      <Pill tone="warning">Da associare</Pill>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span>{DOCUMENT_TYPE_LABELS[d.type]}</span>
                    {d.typeSource && d.typeSource !== "USER" && <SourceBadge source={d.typeSource} />}
                  </div>
                  {d.typeSource && d.typeSource !== "USER" && d.classificationConfidence !== null && (
                    <div className="text-[11px] text-muted-foreground">confidenza {Math.round(d.classificationConfidence * 100)}%</div>
                  )}
                </td>
                <td className="num px-3 py-2 text-right">{d.fiscalYear ?? "—"}</td>
                <td className="px-3 py-2">
                  <DocumentStatusBadge status={d.status} />
                </td>
                <td className="px-3 py-2">
                  {extraction ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <ExtractionStatusBadge status={extraction.status} />
                        <SourceBadge source={extraction.method} />
                      </div>
                      {extraction.appliedAction && extraction.status === "PENDING_REVIEW" && (
                        <div className="text-[11px] text-muted-foreground">{APPLIED_ACTION_LABELS[extraction.appliedAction]}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {formatDate(d.createdAt)}
                  {d.uploadedBy && <div className="text-[11px]">{d.uploadedBy.name}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
