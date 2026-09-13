import { db } from "@/lib/db";
import { assertCompanyInOrg } from "./companies";
import { authorize, type ServiceContext } from "./context";

export async function globalSearch(ctx: ServiceContext, rawQuery: string) {
  authorize(ctx, "company:read");
  const q = rawQuery.trim();
  if (q.length < 2) return { companies: [], operations: [], documents: [], tasks: [] };
  const org = ctx.organizationId;
  const [companies, operations, documents, tasks] = await Promise.all([
    db.company.findMany({
      where: {
        organizationId: org,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { vatNumber: { contains: q } }, { city: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, name: true, city: true, vatNumber: true },
      take: 6,
    }),
    db.financingOperation.findMany({
      where: { organizationId: org, OR: [{ title: { contains: q, mode: "insensitive" } }, { bank: { contains: q, mode: "insensitive" } }] },
      select: { id: true, title: true, bank: true, status: true, company: { select: { name: true } } },
      take: 6,
    }),
    db.document.findMany({
      where: { organizationId: org, fileName: { contains: q, mode: "insensitive" } },
      select: { id: true, fileName: true, type: true, company: { select: { name: true } } },
      take: 6,
    }),
    db.task.findMany({
      where: { organizationId: org, title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, status: true, company: { select: { name: true } } },
      take: 6,
    }),
  ]);
  return { companies, operations, documents, tasks };
}

export interface KnowledgeHit {
  documentId: string;
  fileName: string;
  documentType: string;
  page: number;
  snippet: string;
}

/** Full-text search (Postgres, Italian dictionary) over the company's document text. */
export async function searchCompanyKnowledge(ctx: ServiceContext, companyId: string, query: string, limit = 6): Promise<KnowledgeHit[]> {
  authorize(ctx, "document:read");
  await assertCompanyInOrg(ctx, companyId);
  const q = query.trim();
  if (q.length < 2) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 10);

  const rows = await db.$queryRaw<{ documentId: string; fileName: string; type: string; pageNumber: number; snippet: string }[]>`
    SELECT c."documentId", d."fileName", d."type"::text AS "type", c."pageNumber",
      ts_headline('italian', c."content", query, 'MaxWords=45, MinWords=15, StartSel=«, StopSel=»') AS snippet
    FROM "DocumentChunk" c
    JOIN "Document" d ON d."id" = c."documentId",
      websearch_to_tsquery('italian', ${q}) query
    WHERE c."organizationId" = ${ctx.organizationId}
      AND c."companyId" = ${companyId}
      AND to_tsvector('italian', c."content") @@ query
    ORDER BY ts_rank(to_tsvector('italian', c."content"), query) DESC
    LIMIT ${safeLimit}`;

  if (rows.length > 0) {
    return rows.map((r) => ({ documentId: r.documentId, fileName: r.fileName, documentType: r.type, page: r.pageNumber, snippet: r.snippet }));
  }

  // Fallback: substring match on the most significant words (e.g. codes, names not in the dictionary)
  const words = q.split(/\s+/).filter((w) => w.length >= 4).slice(0, 4);
  if (words.length === 0) return [];
  const chunks = await db.documentChunk.findMany({
    where: {
      organizationId: ctx.organizationId,
      companyId,
      OR: words.map((w) => ({ content: { contains: w, mode: "insensitive" as const } })),
    },
    include: { document: { select: { fileName: true, type: true } } },
    take: safeLimit,
  });
  return chunks.map((c) => {
    const lower = c.content.toLowerCase();
    const idx = Math.max(0, Math.min(...words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0)));
    return {
      documentId: c.documentId,
      fileName: c.document.fileName,
      documentType: c.document.type,
      page: c.pageNumber,
      snippet: c.content.slice(Math.max(0, idx - 80), idx + 220),
    };
  });
}
