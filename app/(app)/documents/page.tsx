import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listCompanies } from "@/services/companies";
import { contextFromUser } from "@/services/context";
import { listDocuments } from "@/services/documents";

export const metadata: Metadata = { title: "Documenti" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ review?: string; type?: string; q?: string; upload?: string }> }) {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const sp = await searchParams;
  const review = sp.review === "1";
  const [documents, companies] = await Promise.all([listDocuments(ctx, { review, type: sp.type, q: sp.q }), listCompanies(ctx)]);
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { review: review ? "1" : undefined, type: sp.type, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    return `/documents${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Documenti"
        description="Upload, classificazione, estrazione dati e revisione"
        actions={can(user.role, "document:write") && <UploadDialog companies={companies.map((c) => ({ id: c.id, name: c.name }))} defaultOpen={sp.upload === "1"} />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          <Link href={href({ review: undefined })} className={cn("rounded px-2.5 py-1 text-xs font-medium", !review ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            Tutti
          </Link>
          <Link href={href({ review: "1" })} className={cn("rounded px-2.5 py-1 text-xs font-medium", review ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            Da verificare
          </Link>
        </div>
        <form action="/documents" className="relative">
          {review && <input type="hidden" name="review" value="1" />}
          {sp.type && <input type="hidden" name="type" value={sp.type} />}
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q} placeholder="Nome file" className="h-8 w-56 pl-8" />
        </form>
        <div className="flex flex-wrap gap-1">
          <Link href={href({ type: undefined })} className={cn("rounded-md px-2 py-1 text-xs", !sp.type ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted")}>
            Tutti i tipi
          </Link>
          {DOCUMENT_TYPES.map((t) => (
            <Link key={t} href={href({ type: t })} className={cn("rounded-md px-2 py-1 text-xs", sp.type === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted")}>
              {DOCUMENT_TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
      </div>
      <Panel>
        <DocumentsTable documents={documents} />
      </Panel>
    </>
  );
}
