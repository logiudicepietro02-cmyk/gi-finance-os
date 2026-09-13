import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCompany } from "@/services/companies";
import { globalSearch, searchCompanyKnowledge } from "@/services/search";
import { createTask } from "@/services/tasks";
import { createOrgFixture, deleteOrg, uniqueVat } from "./helpers";

type Fixture = Awaited<ReturnType<typeof createOrgFixture>>;

let org: Fixture;
let companyId: string;
let documentId: string;

beforeAll(async () => {
  org = await createOrgFixture("Ricerca");
  const company = await createCompany(org.owner, { name: "Ricerca Globale S.r.l.", vatNumber: uniqueVat(), city: "Verona" });
  companyId = company.id;
  await createTask(org.owner, { title: "Verificare bilancio consolidato", companyId });

  const document = await db.document.create({
    data: {
      organizationId: org.org.id,
      companyId,
      fileName: "bilancio-consolidato-2025.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: `test/${org.suffix}/doc.pdf`,
      checksum: `checksum-${org.suffix}`,
      status: "PROCESSED",
    },
  });
  documentId = document.id;
  await db.documentChunk.createMany({
    data: [
      {
        organizationId: org.org.id,
        companyId,
        documentId,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Il bilancio consolidato 2025 mostra una crescita del fatturato rispetto all'esercizio precedente.",
      },
      {
        organizationId: org.org.id,
        companyId,
        documentId,
        pageNumber: 2,
        chunkIndex: 1,
        content: "Il patrimonio netto risulta rafforzato dagli utili non distribuiti dell'esercizio.",
      },
    ],
  });
});

afterAll(async () => {
  await deleteOrg(org.org.id);
});

describe("globalSearch", () => {
  it("matches across companies, documents and tasks", async () => {
    const result = await globalSearch(org.owner, "consolidat");
    expect(result.companies.map((c) => c.id)).not.toContain(companyId); // query doesn't match the company name
    expect(result.documents.map((d) => d.id)).toContain(documentId);
    expect(result.tasks.some((t) => t.title.includes("consolidato"))).toBe(true);
  });

  it("matches the company by name and by VAT number", async () => {
    const byName = await globalSearch(org.owner, "Ricerca Globale");
    expect(byName.companies.map((c) => c.id)).toContain(companyId);
  });

  it("returns empty results for a query shorter than 2 characters", async () => {
    const result = await globalSearch(org.owner, "a");
    expect(result).toEqual({ companies: [], operations: [], documents: [], tasks: [] });
  });
});

describe("searchCompanyKnowledge", () => {
  it("finds a chunk via Italian full-text search", async () => {
    const hits = await searchCompanyKnowledge(org.owner, companyId, "patrimonio netto");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].snippet).toMatch(/patrimonio/i);
    expect(hits[0].page).toBe(2);
  });

  it("falls back to substring matching when the full-text query has no tsvector match", async () => {
    // "consolidato" is in the chunk; "inesistente123" is not anywhere — the AND-ed
    // websearch_to_tsquery yields zero full-text matches, forcing the substring fallback.
    const hits = await searchCompanyKnowledge(org.owner, companyId, "consolidato inesistente123");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].snippet).toMatch(/consolidato/i);
  });

  it("returns no results for a query with no match at all", async () => {
    const hits = await searchCompanyKnowledge(org.owner, companyId, "xyzxyzxyz nonesistente999");
    expect(hits).toEqual([]);
  });
});
