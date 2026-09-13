import { Landmark } from "lucide-react";
import Link from "next/link";
import { OperationStatusBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/page-header";
import { daysUntil } from "@/lib/dates";
import { formatCurrency, formatDate, formatNumber } from "@/lib/financial/format";
import { OPERATION_SOURCE_LABELS, OPERATION_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { OperationListItem } from "@/services/operations";

export function OperationsTable({ operations, showCompany = true }: { operations: OperationListItem[]; showCompany?: boolean }) {
  if (operations.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={<Landmark />} title="Nessuna operazione" description="Crea un'operazione per gestire pipeline, checklist documentale e scadenze." />
      </div>
    );
  }
  const now = new Date();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" data-testid="operations-table">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Operazione</th>
            {showCompany && <th className="px-3 py-2 text-left font-medium">Azienda</th>}
            <th className="px-3 py-2 text-left font-medium">Banca</th>
            <th className="px-3 py-2 text-left font-medium">Tipo</th>
            <th className="px-3 py-2 text-right font-medium">Importo</th>
            <th className="px-3 py-2 text-right font-medium">Debito residuo</th>
            <th className="px-3 py-2 text-right font-medium">Tasso</th>
            <th className="px-3 py-2 text-right font-medium">Scadenza</th>
            <th className="px-3 py-2 text-left font-medium">Stato</th>
            <th className="px-4 py-2 text-right font-medium">Documenti</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => {
            const days = op.maturityDate ? daysUntil(now, new Date(op.maturityDate)) : null;
            const closed = op.status === "REJECTED";
            return (
              <tr key={op.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="max-w-[260px] px-4 py-2">
                  <Link href={`/operations/${op.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                    {op.title}
                  </Link>
                  {op.probability !== null && !["COMPLETED", "REJECTED"].includes(op.status) && (
                    <div className="text-[11px] text-muted-foreground">Probabilità {op.probability}%</div>
                  )}
                  {op.source !== "CLIENTE_PROPRIO" && (
                    <div className="text-[11px] text-muted-foreground">{op.source === "ALTRO" && op.sourceDetail ? op.sourceDetail : OPERATION_SOURCE_LABELS[op.source]}</div>
                  )}
                </td>
                {showCompany && (
                  <td className="px-3 py-2">
                    <Link href={`/companies/${op.company.id}`} className="hover:underline">
                      {op.company.name}
                    </Link>
                  </td>
                )}
                <td className="px-3 py-2">{op.bank}</td>
                <td className="px-3 py-2 text-muted-foreground">{OPERATION_TYPE_LABELS[op.type]}</td>
                <td className="num px-3 py-2 text-right">{op.amount !== null ? formatCurrency(op.amount, { compact: true }) : "—"}</td>
                <td className="num px-3 py-2 text-right">{op.outstandingDebt !== null ? formatCurrency(op.outstandingDebt, { compact: true }) : "—"}</td>
                <td className="num px-3 py-2 text-right">{op.rate !== null ? `${formatNumber(op.rate, 2)}%` : "—"}</td>
                <td className={cn("num px-3 py-2 text-right", !closed && days !== null && days >= 0 && days <= 60 && "font-medium text-red-600")}>
                  {op.maturityDate ? formatDate(op.maturityDate) : "—"}
                  {!closed && days !== null && days >= 0 && days <= 60 && <div className="text-[11px]">tra {days} giorni</div>}
                </td>
                <td className="px-3 py-2">
                  <OperationStatusBadge status={op.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  {op.checklistSummary.required > 0 ? (
                    <span className={cn("num", op.checklistSummary.missing.length > 0 ? "text-amber-700" : "text-emerald-700")} title={op.checklistSummary.missing.join(", ")}>
                      {op.checklistSummary.received}/{op.checklistSummary.required}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
