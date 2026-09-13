import type { DocumentTypeKey } from "@/lib/documents/types";
import type { OperationTypeKey } from "@/lib/labels";

export interface ChecklistTemplateItem {
  name: string;
  documentType: DocumentTypeKey;
  required: boolean;
  /** For BILANCIO: 0 = latest fiscal year available, 1 = the one before */
  yearOffset?: number;
}

const BILANCIO_ULTIMO: ChecklistTemplateItem = { name: "Bilancio ultimo esercizio", documentType: "BILANCIO", required: true, yearOffset: 0 };
const BILANCIO_PRECEDENTE: ChecklistTemplateItem = { name: "Bilancio esercizio precedente", documentType: "BILANCIO", required: true, yearOffset: 1 };
const SITUAZIONE: ChecklistTemplateItem = { name: "Situazione contabile aggiornata", documentType: "SITUAZIONE_CONTABILE", required: true };
const VISURA: ChecklistTemplateItem = { name: "Visura camerale", documentType: "VISURA", required: true };
const IDENTITA: ChecklistTemplateItem = { name: "Documento d'identità legale rappresentante", documentType: "DOCUMENTO_IDENTITA", required: true };
const CENTRALE_RISCHI: ChecklistTemplateItem = { name: "Centrale Rischi Banca d'Italia", documentType: "DOCUMENTO_BANCARIO", required: true };
const BUSINESS_PLAN: ChecklistTemplateItem = { name: "Business plan", documentType: "BUSINESS_PLAN", required: true };

const CORE = [BILANCIO_ULTIMO, BILANCIO_PRECEDENTE, SITUAZIONE, VISURA, IDENTITA];

export const CHECKLIST_TEMPLATES: Record<OperationTypeKey, ChecklistTemplateItem[]> = {
  MUTUO_CHIROGRAFARIO: [...CORE, CENTRALE_RISCHI, BUSINESS_PLAN],
  FINANZIAMENTO_GARANTITO: [...CORE, CENTRALE_RISCHI, BUSINESS_PLAN],
  MINIBOND: [...CORE, CENTRALE_RISCHI, BUSINESS_PLAN],
  MUTUO_IPOTECARIO: [
    ...CORE,
    CENTRALE_RISCHI,
    { name: "Perizia immobile", documentType: "ALTRO", required: true },
    { ...BUSINESS_PLAN, required: false },
  ],
  FIDO_CASSA: [...CORE, CENTRALE_RISCHI],
  ANTICIPO_FATTURE: [...CORE, CENTRALE_RISCHI, { name: "Elenco principali clienti", documentType: "ALTRO", required: false }],
  LEASING: [BILANCIO_ULTIMO, VISURA, IDENTITA, { name: "Preventivo del bene", documentType: "ALTRO", required: true }],
  FACTORING: [BILANCIO_ULTIMO, VISURA, IDENTITA, { name: "Elenco crediti da cedere", documentType: "ALTRO", required: true }],
  ALTRO: CORE,
};

export function checklistTemplateFor(type: OperationTypeKey): ChecklistTemplateItem[] {
  return CHECKLIST_TEMPLATES[type] ?? CHECKLIST_TEMPLATES.ALTRO;
}

export interface MatchableDocument {
  id: string;
  type: string;
  fiscalYear: number | null;
}

/** Links already-uploaded company documents to template items (deterministic). */
export function matchDocumentsToTemplate(template: ChecklistTemplateItem[], docs: MatchableDocument[]): (string | null)[] {
  const bilanciByYear = new Map<number, string>();
  for (const d of docs) {
    if (d.type === "BILANCIO" && d.fiscalYear !== null && !bilanciByYear.has(d.fiscalYear)) bilanciByYear.set(d.fiscalYear, d.id);
  }
  const years = [...bilanciByYear.keys()].sort((a, b) => b - a);
  return template.map((item) => {
    if (item.documentType === "ALTRO") return null;
    if (item.documentType === "BILANCIO" && item.yearOffset !== undefined) {
      const year = years[item.yearOffset];
      return year !== undefined ? (bilanciByYear.get(year) ?? null) : null;
    }
    return docs.find((d) => d.type === item.documentType)?.id ?? null;
  });
}

export function missingRequiredItems<T extends { required: boolean; status: string }>(items: T[]): T[] {
  return items.filter((i) => i.required && (i.status === "MISSING" || i.status === "REQUESTED"));
}
