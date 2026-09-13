import { Download, ExternalLink, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentStatusBadge } from "@/components/app/badges";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { DocumentMetaEditor } from "@/components/documents/document-meta-editor";
import { DocumentProcessor } from "@/components/documents/document-processor";
import { ExtractionReview } from "@/components/documents/extraction-review";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import type { StepLog } from "@/lib/documents/pipeline";
import { DOCUMENT_TYPE_LABELS, FINANCIAL_STATEMENT_TYPES } from "@/lib/documents/types";
import { formatDateTime } from "@/lib/financial/format";
import { can, NotFoundError } from "@/lib/permissions";
import { listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { getDocument } from "@/services/documents";
import { listInsights } from "@/services/insights";

export const metadata: Metadata = { title: "Documento" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ process?: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const { id } = await params;
  const sp = await searchParams;

  let document;
  try {
    document = await getDocument(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [companies, insights] = await Promise.all([
    listCompanies(ctx),
    document.companyId ? listInsights(ctx, { companyId: document.companyId, kinds: ["DOCUMENT_INSIGHT"], limit: 20 }) : Promise.resolve([]),
  ]);
  const docInsight = insights.find((i) => (i.content as { documentId?: string } | null)?.documentId === id);
  const extraction = document.extractions[0];
  const isFinancial = FINANCIAL_STATEMENT_TYPES.includes(document.type);
  const insightContent = docInsight?.content as { summary: string; key_points: string[]; relevant_dates: { date: string; description: string }[]; model?: string } | undefined;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Documenti", href: "/documents" }, ...(document.company ? [{ label: document.company.name, href: `/companies/${document.company.id}` }] : []), { label: document.fileName }]}
        title={document.fileName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {DOCUMENT_TYPE_LABELS[document.type]}
            {document.fiscalYear ? ` · esercizio ${document.fiscalYear}` : ""} · caricato {formatDateTime(document.createdAt)}
            {document.uploadedBy ? ` da ${document.uploadedBy.name}` : ""}
            <DocumentStatusBadge status={document.status} />
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/documents/${id}/file`} target="_blank" rel="noreferrer">
                <ExternalLink /> Apri PDF
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/documents/${id}/file?download=1`}>
                <Download /> Scarica
              </a>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:h-[calc(100dvh-230px)] xl:grid-cols-[minmax(0,1fr)_480px]">
        <Panel className="overflow-hidden xl:flex xl:min-h-0 xl:flex-col" bodyClassName="h-[70vh] min-h-[420px] xl:h-auto xl:min-h-0 xl:flex-1">
          <iframe src={`/api/documents/${id}/file#view=FitH`} title={document.fileName} className="size-full" />
        </Panel>

        <div className="min-w-0 space-y-5 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <Panel title="Analisi documento" description="Testo → classificazione → estrazione → validazione → aggiornamento azienda">
            <DocumentProcessor
              documentId={id}
              initialStatus={document.status}
              initialLog={(document.processingLog as unknown as StepLog[] | null) ?? []}
              initialError={document.errorMessage}
              autoStart={sp.process === "1" && document.status === "UPLOADED"}
              canProcess={can(user.role, "document:write")}
            />
          </Panel>

          {extraction ? (
            <Panel title="Dati estratti" description={`Estrazione del ${formatDateTime(extraction.createdAt)} · schema ${extraction.schemaVersion}`}>
              <ExtractionReview extraction={extraction} canApprove={can(user.role, "financials:approve")} hasCompany={Boolean(document.companyId)} />
            </Panel>
          ) : (
            document.status === "PROCESSED" &&
            !isFinancial && (
              <Panel title="Dati estratti">
                <p className="p-4 text-sm text-muted-foreground">
                  L&apos;estrazione strutturata è prevista per bilanci e situazioni contabili. Il testo del documento è indicizzato ed è consultabile dal Copilot.
                </p>
              </Panel>
            )
          )}

          {insightContent && (
            <Panel
              title={
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-violet-600" /> Sintesi AI
                </span>
              }
            >
              <div className="space-y-2 p-4 text-[13px]">
                <p>{insightContent.summary}</p>
                <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                  {insightContent.key_points.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            </Panel>
          )}

          <Panel title="Classificazione e associazione">
            <DocumentMetaEditor
              document={document}
              companies={companies.map((c) => ({ id: c.id, name: c.name }))}
              canEdit={can(user.role, "document:write")}
              canDelete={can(user.role, "document:delete")}
            />
          </Panel>

          {document.financingDocuments.length > 0 && (
            <Panel title="Collegato alle operazioni">
              <ul className="divide-y">
                {document.financingDocuments.map((f) => (
                  <li key={f.id} className="px-4 py-2 text-[13px]">
                    <Link href={`/operations/${f.operation.id}`} className="font-medium hover:underline">
                      {f.operation.title}
                    </Link>
                    <span className="text-muted-foreground"> · {f.name}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
