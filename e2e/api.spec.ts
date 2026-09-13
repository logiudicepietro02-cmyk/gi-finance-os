import { expect, test } from "@playwright/test";
import { generateBilancioPdf } from "../lib/documents/demo-pdf";
import { PASSWORD, USERS, apiAs, uniqueVat } from "./helpers";

test.describe.configure({ mode: "serial" });

test("API richiede autenticazione", async ({ request }) => {
  for (const path of ["/api/companies", "/api/tasks", "/api/operations", "/api/documents", "/api/dashboard", "/api/search?q=alfa"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
  }
});

test("login: credenziali errate e validazione", async ({ request }) => {
  expect((await request.post("/api/auth/login", { data: { email: USERS.owner, password: "sbagliata" } })).status()).toBe(401);
  expect((await request.post("/api/auth/login", { data: { email: "non-email", password: PASSWORD } })).status()).toBe(400);
});

test("companies: creazione, validazione e lettura", async ({ baseURL }) => {
  const api = await apiAs(baseURL!, "advisor");
  const invalid = await api.post("/api/companies", { data: { name: "X", vatNumber: "123" } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).issues.length).toBeGreaterThan(0);

  const created = await api.post("/api/companies", { data: { name: `API Test ${Date.now()} S.r.l.`, vatNumber: uniqueVat(), city: "Padova" } });
  expect(created.status()).toBe(200);
  const company = await created.json();

  const list = await (await api.get("/api/companies")).json();
  expect(list.some((c: { id: string }) => c.id === company.id)).toBe(true);
  const detail = await api.get(`/api/companies/${company.id}`);
  expect(detail.status()).toBe(200);

  const financials = await (await api.get(`/api/companies/${company.id}/financials`)).json();
  expect(financials.statements).toEqual([]);
});

test("financial engine: ratios deterministici con formula", async ({ baseURL }) => {
  const api = await apiAs(baseURL!, "owner");
  const companies = await (await api.get("/api/companies?q=Beta")).json();
  const beta = companies[0];
  const overview = await (await api.get(`/api/companies/${beta.id}/financials`)).json();
  const dscr = overview.latest.ratios.find((r: { key: string }) => r.key === "dscr");
  expect(dscr.formula).toBe("EBITDA / (Oneri finanziari + Quota capitale annua)");
  expect(dscr.value).toBeCloseTo(0.95, 5);
  expect(dscr.inputs).toHaveLength(3);
});

test("isolamento tenant via HTTP: risorse di un'altra organizzazione → 404", async ({ baseURL }) => {
  const other = await apiAs(baseURL!, "otherOrg");
  const otherCompanies = await (await other.get("/api/companies")).json();
  expect(otherCompanies).toHaveLength(1);
  const foreignId = otherCompanies[0].id;

  const demo = await apiAs(baseURL!, "owner");
  expect((await demo.get(`/api/companies/${foreignId}`)).status()).toBe(404);
  expect((await demo.patch(`/api/companies/${foreignId}`, { data: { name: "Hijack" } })).status()).toBe(404);
  expect((await demo.get(`/api/companies/${foreignId}/financials`)).status()).toBe(404);
  expect((await demo.post("/api/tasks", { data: { title: "Cross tenant", companyId: foreignId } })).status()).toBe(404);
  const search = await (await demo.get("/api/search?q=Omega")).json();
  expect(search.companies).toHaveLength(0);
});

test("RBAC: l'analyst non crea operazioni né modifica soglie", async ({ baseURL }) => {
  const analyst = await apiAs(baseURL!, "analyst");
  const companies = await (await analyst.get("/api/companies")).json();
  const op = await analyst.post("/api/operations", { data: { companyId: companies[0].id, title: "Non consentita", bank: "Banca", type: "LEASING" } });
  expect(op.status()).toBe(403);
  expect((await analyst.put("/api/settings", { data: { dscrMin: 1, netDebtEbitdaMax: 5, maturityWarningDays: 30 } })).status()).toBe(403);
  expect((await analyst.get("/api/activity")).status()).toBe(403);
});

test("task: creazione e completamento", async ({ baseURL }) => {
  const api = await apiAs(baseURL!, "advisor");
  const res = await api.post("/api/tasks", { data: { title: "Task API", priority: "HIGH", dueDate: "2030-01-15" } });
  expect(res.status()).toBe(200);
  const task = await res.json();
  const done = await api.patch(`/api/tasks/${task.id}`, { data: { status: "DONE" } });
  expect(done.status()).toBe(200);
  expect((await done.json()).completedAt).not.toBeNull();
  const invalid = await api.patch(`/api/tasks/${task.id}`, { data: { status: "FATTO" } });
  expect(invalid.status()).toBe(400);
});

test("documenti: rifiuta non-PDF, elabora un bilancio PDF", async ({ baseURL }) => {
  const api = await apiAs(baseURL!, "advisor");
  const bad = await api.post("/api/documents", { multipart: { file: { name: "nota.pdf", mimeType: "application/pdf", buffer: Buffer.from("non sono un pdf") } } });
  expect(bad.status()).toBe(400);

  const vat = uniqueVat();
  const company = await (await api.post("/api/companies", { data: { name: `Documenti API ${Date.now()} S.r.l.`, vatNumber: vat } })).json();
  const pdf = await generateBilancioPdf({
    companyName: company.name,
    vatNumber: vat,
    city: "Trento",
    fiscalYear: 2025,
    current: { revenue: 4_000_000, ebit: 300_000, depreciation: 120_000, netIncome: 150_000, cash: 400_000, financialDebt: 1_500_000, equity: 1_200_000, currentAssets: 2_000_000, currentLiabilities: 1_400_000, inventory: 500_000, totalAssets: 3_600_000, interestExpense: 60_000, principalRepayment: 250_000 },
  });
  const upload = await api.post("/api/documents", { multipart: { file: { name: "bilancio-2025.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) } } });
  expect(upload.status()).toBe(200);
  const { document } = await upload.json();

  const processed = await (await api.post(`/api/documents/${document.id}/process`)).json();
  expect(processed.status).toBe("PROCESSED");
  expect(processed.appliedAction).toBe("CREATED_STATEMENT");

  const overview = await (await api.get(`/api/companies/${company.id}/financials`)).json();
  expect(overview.latest.values.revenue).toBe(4_000_000);
  expect(overview.latest.status).toBe("EXTRACTED");
});

test("copilot: risposta tramite provider configurato e tool interni", async ({ baseURL }) => {
  const api = await apiAs(baseURL!, "advisor");
  const companies = await (await api.get("/api/companies?q=Alfa")).json();
  const res = await api.post("/api/copilot", { data: { companyId: companies[0].id, message: "Analizza l'azienda" } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.message.content).toContain("Alfa Meccanica");
  expect(body.message.toolCalls.map((t: { name: string }) => t.name)).toContain("get_company_financials");
});
