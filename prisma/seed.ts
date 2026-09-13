/**
 * Demo data for GI FINANCE OS. Run with `npm run seed`.
 * All companies, people, banks and numbers are fictitious.
 *
 * The seed uses the real application services (upload → document pipeline → review/approval,
 * operations with checklists, tasks, alert engine), so the demo data is produced exactly like production data.
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "@/lib/auth/password";
import { addDays, startOfDay } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  generateBilancioPdf,
  generateBusinessPlanPdf,
  generateCentraleRischiPdf,
  generateLoanContractPdf,
  generateSituazioneContabilePdf,
  generateVisuraPdf,
  type DemoFinancials,
} from "@/lib/documents/demo-pdf";
import type { StatementValues } from "@/lib/financial/fields";
import { syncAlerts } from "@/services/alerts";
import { addContact, createCompany } from "@/services/companies";
import type { ServiceContext } from "@/services/context";
import { uploadDocument } from "@/services/documents";
import { approveExtraction, createStatement } from "@/services/financials";
import { createOperation } from "@/services/operations";
import { createTask } from "@/services/tasks";
import { processDocument } from "@/workers/document-processor";

// The seed never calls an LLM: documents are processed with the deterministic rules extractor.
process.env.AI_PROVIDER = "none";

export const DEMO_PASSWORD = "GiFinance2026!";
const DEMO_SLUGS = ["gi-finance-demo", "studio-esempio"];

const now = new Date();
const daysAgo = (n: number) => addDays(now, -n);
const inDays = (n: number) => addDays(startOfDay(now), n);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function values(f: DemoFinancials): StatementValues {
  return { ...f, ebitda: f.ebit + f.depreciation, netFinancialPosition: f.financialDebt - f.cash };
}

// ─── Company profiles ───────────────────────────────────────
interface CompanySeed {
  key: string;
  name: string;
  legalForm: string;
  vatNumber: string;
  city: string;
  province: string;
  sector: string;
  ateco: string;
  employees: number;
  foundedYear: number;
  description: string;
  advisor: "owner" | "advisor";
  contact: { name: string; role: string; email: string; phone: string };
  financials: Record<number, DemoFinancials>;
  bilanciDocs: number[];
}

const COMPANIES: CompanySeed[] = [
  {
    key: "alfa",
    name: "Alfa Meccanica S.r.l.",
    legalForm: "S.r.l.",
    vatNumber: "99900000011",
    city: "Brescia",
    province: "BS",
    sector: "Meccanica di precisione",
    ateco: "25.62",
    employees: 48,
    foundedYear: 1998,
    description: "Lavorazioni meccaniche conto terzi per automotive e macchine agricole. Piano di investimento in una nuova linea CNC.",
    advisor: "advisor",
    contact: { name: "Paolo Rinaldi (fittizio)", role: "Amministratore unico", email: "p.rinaldi@alfameccanica.demo", phone: "+39 030 000 0001" },
    financials: {
      2023: { revenue: 9_200_000, ebit: 820_000, depreciation: 380_000, netIncome: 480_000, cash: 1_100_000, financialDebt: 3_600_000, equity: 2_900_000, currentAssets: 4_300_000, currentLiabilities: 3_300_000, inventory: 1_150_000, totalAssets: 9_800_000, interestExpense: 120_000, principalRepayment: 520_000 },
      2024: { revenue: 10_400_000, ebit: 900_000, depreciation: 450_000, netIncome: 510_000, cash: 900_000, financialDebt: 4_900_000, equity: 3_300_000, currentAssets: 4_800_000, currentLiabilities: 3_800_000, inventory: 1_350_000, totalAssets: 11_200_000, interestExpense: 170_000, principalRepayment: 640_000 },
      2025: { revenue: 11_300_000, ebit: 790_000, depreciation: 560_000, netIncome: 380_000, cash: 650_000, financialDebt: 6_600_000, equity: 3_600_000, currentAssets: 5_200_000, currentLiabilities: 4_500_000, inventory: 1_600_000, totalAssets: 13_100_000, interestExpense: 260_000, principalRepayment: 740_000 },
    },
    bilanciDocs: [2023, 2024, 2025],
  },
  {
    key: "beta",
    name: "Beta Alimentare S.p.A.",
    legalForm: "S.p.A.",
    vatNumber: "99900000022",
    city: "Parma",
    province: "PR",
    sector: "Industria alimentare",
    ateco: "10.85",
    employees: 120,
    foundedYear: 1987,
    description: "Produzione di piatti pronti per la GDO. Marginalità sotto pressione per il costo delle materie prime.",
    advisor: "owner",
    contact: { name: "Laura Conti (fittizia)", role: "CFO", email: "l.conti@betaalimentare.demo", phone: "+39 0521 000 002" },
    financials: {
      2023: { revenue: 24_000_000, ebit: 1_500_000, depreciation: 900_000, netIncome: 700_000, cash: 2_000_000, financialDebt: 9_000_000, equity: 7_500_000, currentAssets: 10_500_000, currentLiabilities: 8_200_000, inventory: 3_900_000, totalAssets: 22_000_000, interestExpense: 380_000, principalRepayment: 1_500_000 },
      2024: { revenue: 25_100_000, ebit: 1_300_000, depreciation: 950_000, netIncome: 520_000, cash: 1_700_000, financialDebt: 9_600_000, equity: 7_900_000, currentAssets: 10_900_000, currentLiabilities: 8_900_000, inventory: 4_200_000, totalAssets: 23_100_000, interestExpense: 430_000, principalRepayment: 1_650_000 },
      2025: { revenue: 24_300_000, ebit: 900_000, depreciation: 1_000_000, netIncome: 210_000, cash: 1_400_000, financialDebt: 10_100_000, equity: 8_050_000, currentAssets: 10_600_000, currentLiabilities: 9_400_000, inventory: 4_500_000, totalAssets: 23_600_000, interestExpense: 500_000, principalRepayment: 1_500_000 },
    },
    bilanciDocs: [2024, 2025],
  },
  {
    key: "gamma",
    name: "Gamma Logistica S.r.l.",
    legalForm: "S.r.l.",
    vatNumber: "99900000033",
    city: "Verona",
    province: "VR",
    sector: "Trasporti e logistica",
    ateco: "49.41",
    employees: 65,
    foundedYear: 2006,
    description: "Trasporto merci su strada e magazzino conto terzi. Solida generazione di cassa, mutuo in scadenza.",
    advisor: "advisor",
    contact: { name: "Andrea Galli (fittizio)", role: "Socio amministratore", email: "a.galli@gammalogistica.demo", phone: "+39 045 000 0003" },
    financials: {
      2023: { revenue: 13_500_000, ebit: 1_050_000, depreciation: 650_000, netIncome: 640_000, cash: 1_300_000, financialDebt: 3_800_000, equity: 4_000_000, currentAssets: 5_400_000, currentLiabilities: 4_500_000, inventory: 140_000, totalAssets: 10_900_000, interestExpense: 150_000, principalRepayment: 850_000 },
      2024: { revenue: 14_800_000, ebit: 1_200_000, depreciation: 700_000, netIncome: 760_000, cash: 1_600_000, financialDebt: 3_400_000, equity: 4_600_000, currentAssets: 5_900_000, currentLiabilities: 4_700_000, inventory: 150_000, totalAssets: 11_400_000, interestExpense: 140_000, principalRepayment: 900_000 },
      2025: { revenue: 16_200_000, ebit: 1_380_000, depreciation: 760_000, netIncome: 880_000, cash: 2_100_000, financialDebt: 3_100_000, equity: 5_300_000, currentAssets: 6_600_000, currentLiabilities: 5_000_000, inventory: 160_000, totalAssets: 12_300_000, interestExpense: 130_000, principalRepayment: 950_000 },
    },
    bilanciDocs: [2024, 2025],
  },
  {
    key: "delta",
    name: "Delta Tessile S.r.l.",
    legalForm: "S.r.l.",
    vatNumber: "99900000044",
    city: "Prato",
    province: "PO",
    sector: "Tessile",
    ateco: "13.20",
    employees: 34,
    foundedYear: 1979,
    description: "Tessitura per l'alta moda. Calo degli ordini e tensione di liquidità negli ultimi due esercizi.",
    advisor: "owner",
    contact: { name: "Elena Marchi (fittizia)", role: "Amministratrice delegata", email: "e.marchi@deltatessile.demo", phone: "+39 0574 000 004" },
    financials: {
      2023: { revenue: 6_800_000, ebit: 310_000, depreciation: 290_000, netIncome: 120_000, cash: 500_000, financialDebt: 2_300_000, equity: 1_900_000, currentAssets: 3_100_000, currentLiabilities: 2_400_000, inventory: 1_300_000, totalAssets: 5_600_000, interestExpense: 95_000, principalRepayment: 380_000 },
      2024: { revenue: 5_900_000, ebit: 60_000, depreciation: 300_000, netIncome: -90_000, cash: 320_000, financialDebt: 2_600_000, equity: 1_810_000, currentAssets: 2_900_000, currentLiabilities: 2_700_000, inventory: 1_450_000, totalAssets: 5_400_000, interestExpense: 120_000, principalRepayment: 400_000 },
      2025: { revenue: 5_100_000, ebit: -490_000, depreciation: 310_000, netIncome: -620_000, cash: 210_000, financialDebt: 2_750_000, equity: 1_190_000, currentAssets: 2_600_000, currentLiabilities: 2_900_000, inventory: 1_500_000, totalAssets: 5_000_000, interestExpense: 140_000, principalRepayment: 420_000 },
    },
    bilanciDocs: [2024, 2025],
  },
  {
    key: "epsilon",
    name: "Epsilon Software S.r.l.",
    legalForm: "S.r.l.",
    vatNumber: "99900000055",
    city: "Milano",
    province: "MI",
    sector: "Software e servizi digitali",
    ateco: "62.01",
    employees: 28,
    foundedYear: 2016,
    description: "Software gestionale in cloud per studi professionali. Forte crescita, liquidità elevata, progetto di R&S agevolato.",
    advisor: "advisor",
    contact: { name: "Davide Ferraro (fittizio)", role: "CEO", email: "d.ferraro@epsilonsoftware.demo", phone: "+39 02 0000 0005" },
    financials: {
      2023: { revenue: 2_100_000, ebit: 330_000, depreciation: 90_000, netIncome: 240_000, cash: 1_400_000, financialDebt: 300_000, equity: 1_500_000, currentAssets: 2_300_000, currentLiabilities: 800_000, inventory: 0, totalAssets: 2_900_000, interestExpense: 12_000, principalRepayment: 100_000 },
      2024: { revenue: 2_900_000, ebit: 510_000, depreciation: 110_000, netIncome: 370_000, cash: 1_900_000, financialDebt: 250_000, equity: 1_870_000, currentAssets: 3_000_000, currentLiabilities: 1_000_000, inventory: 0, totalAssets: 3_600_000, interestExpense: 10_000, principalRepayment: 100_000 },
      2025: { revenue: 3_800_000, ebit: 700_000, depreciation: 140_000, netIncome: 500_000, cash: 2_600_000, financialDebt: 900_000, equity: 2_370_000, currentAssets: 3_900_000, currentLiabilities: 1_300_000, inventory: 0, totalAssets: 4_700_000, interestExpense: 25_000, principalRepayment: 150_000 },
    },
    bilanciDocs: [2024, 2025],
  },
];

// ─── Helpers ────────────────────────────────────────────────
async function cleanup() {
  const orgs = await db.organization.findMany({ where: { slug: { in: DEMO_SLUGS } }, select: { id: true } });
  if ((process.env.STORAGE_DRIVER ?? "local") === "local") {
    const root = path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage");
    await Promise.all(orgs.map((o) => rm(path.join(root, o.id), { recursive: true, force: true })));
  }
  await db.organization.deleteMany({ where: { slug: { in: DEMO_SLUGS } } });
}

async function backdate(entityIds: string[], date: Date) {
  await db.auditLog.updateMany({ where: { entityId: { in: entityIds } }, data: { createdAt: date } });
}

async function addDocument(
  ctx: ServiceContext,
  params: { companyId: string; fileName: string; bytes: Uint8Array; uploadedAt: Date; approve?: StatementValues | null },
) {
  const { document } = await uploadDocument(ctx, { fileName: params.fileName, bytes: params.bytes, companyId: params.companyId });
  const result = await processDocument(ctx, document.id);
  if (result.status !== "PROCESSED") throw new Error(`Elaborazione fallita per ${params.fileName}: ${"error" in result ? result.error : ""}`);

  if (result.extractionId && params.approve) {
    const extraction = await db.documentExtraction.findUniqueOrThrow({ where: { id: result.extractionId } });
    const data = extraction.data as { fields: Record<string, { value: number | null }> };
    const mismatches = Object.entries({
      revenue: "revenue",
      ebit: "ebit",
      net_income: "netIncome",
      equity: "equity",
      cash: "cash",
      financial_debt: "financialDebt",
    }).filter(([k, f]) => data.fields[k]?.value !== params.approve?.[f as keyof StatementValues]);
    if (mismatches.length) console.warn(`  ⚠ ${params.fileName}: estrattore a regole diverso su ${mismatches.map(([k]) => k).join(", ")}`);
    await approveExtraction(ctx, result.extractionId, { values: params.approve });
  }

  const ids = [document.id, ...(result.extractionId ? [result.extractionId] : [])];
  await db.document.update({ where: { id: document.id }, data: { createdAt: params.uploadedAt, processedAt: params.uploadedAt } });
  if (result.extractionId) {
    await db.documentExtraction.update({ where: { id: result.extractionId }, data: { createdAt: params.uploadedAt } });
  }
  await backdate(ids, params.uploadedAt);
  return { document, extractionId: result.extractionId };
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log("GI FINANCE OS — seed dati dimostrativi\n");
  await cleanup();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const org = await db.organization.create({
    data: { name: "G.I. Finance — Demo", slug: "gi-finance-demo", settings: { dscrMin: 1.2, netDebtEbitdaMax: 4, maturityWarningDays: 60 } },
  });
  const [owner, advisor, analyst] = await Promise.all([
    db.user.create({ data: { organizationId: org.id, email: "giulia.ferri@gifinance.demo", name: "Giulia Ferri", role: "OWNER", passwordHash } }),
    db.user.create({ data: { organizationId: org.id, email: "marco.bellini@gifinance.demo", name: "Marco Bellini", role: "ADVISOR", passwordHash } }),
    db.user.create({ data: { organizationId: org.id, email: "sara.colombo@gifinance.demo", name: "Sara Colombo", role: "ANALYST", passwordHash } }),
  ]);
  const ctxOf = (u: typeof owner): ServiceContext => ({ userId: u.id, userName: u.name, organizationId: org.id, role: u.role });
  const ownerCtx = ctxOf(owner);
  const advisorCtx = ctxOf(advisor);

  // Companies, contacts, historical statements
  const ids: Record<string, string> = {};
  for (const c of COMPANIES) {
    const ctx = c.advisor === "owner" ? ownerCtx : advisorCtx;
    const company = await createCompany(ownerCtx, {
      name: c.name,
      legalForm: c.legalForm,
      vatNumber: c.vatNumber,
      taxCode: c.vatNumber,
      city: c.city,
      province: c.province,
      sector: c.sector,
      atecoCode: c.ateco,
      employees: c.employees,
      foundedYear: c.foundedYear,
      description: c.description,
      assignedAdvisorId: c.advisor === "owner" ? owner.id : advisor.id,
      status: c.key === "epsilon" ? "PROSPECT" : "ACTIVE",
    });
    ids[c.key] = company.id;
    await db.company.update({ where: { id: company.id }, data: { createdAt: daysAgo(400) } });
    const contact = await addContact(ownerCtx, company.id, { ...c.contact, isPrimary: true });
    await backdate([company.id, contact.id], daysAgo(400));

    for (const [yearKey, financials] of Object.entries(c.financials)) {
      const year = Number(yearKey);
      if (c.bilanciDocs.includes(year)) continue;
      const statement = await createStatement(ctx, company.id, { fiscalYear: year, values: values(financials), notes: "Importato da archivio storico dello studio." });
      await backdate([statement.id], daysAgo(300));
    }
    console.log(`✓ ${c.name}`);
  }

  // Documents (processed by the real pipeline)
  let documentCount = 0;
  for (const c of COMPANIES) {
    const ctx = c.advisor === "owner" ? ownerCtx : advisorCtx;
    const identity = { companyName: c.name, vatNumber: c.vatNumber, city: c.city, province: c.province };
    for (const year of c.bilanciDocs) {
      const pendingReview = c.key === "alfa" && year === 2025;
      const bytes = await generateBilancioPdf({ ...identity, fiscalYear: year, current: c.financials[year], previous: c.financials[year - 1] ?? null });
      await addDocument(ctx, {
        companyId: ids[c.key],
        fileName: `Bilancio_${year}_${c.name.split(" ")[0]}.pdf`,
        bytes,
        uploadedAt: pendingReview ? daysAgo(1) : daysAgo(2026 - year > 1 ? 360 : 120),
        approve: pendingReview ? null : values(c.financials[year]),
      });
      documentCount++;
    }
    const visura = await generateVisuraPdf({
      ...identity,
      reaNumber: `${c.province}-${String(100000 + documentCount * 137).slice(0, 6)}`,
      ateco: c.ateco,
      sector: c.sector,
      foundedYear: c.foundedYear,
      legalRepresentative: c.contact.name,
    });
    await addDocument(ctx, { companyId: ids[c.key], fileName: `Visura_camerale_${c.name.split(" ")[0]}.pdf`, bytes: visura, uploadedAt: daysAgo(90) });
    documentCount++;
  }

  const beta = COMPANIES[1];
  const gamma = COMPANIES[2];
  const delta = COMPANIES[3];
  const epsilon = COMPANIES[4];
  const idOf = (c: CompanySeed) => ({ companyName: c.name, vatNumber: c.vatNumber, city: c.city, province: c.province });

  await addDocument(ownerCtx, {
    companyId: ids.beta,
    fileName: "Centrale_Rischi_Beta_giugno_2026.pdf",
    bytes: await generateCentraleRischiPdf({
      ...idOf(beta),
      referenceDate: "30/06/2026",
      lines: [
        { bank: "Banca Demo Emiliana", category: "Rischi autoliquidanti", granted: 3_000_000, used: 2_750_000 },
        { bank: "Banca Demo Emiliana", category: "Rischi a scadenza", granted: 5_200_000, used: 5_200_000 },
        { bank: "Credito Demo Padano", category: "Rischi a revoca", granted: 900_000, used: 610_000 },
      ],
    }),
    uploadedAt: daysAgo(20),
  });
  await addDocument(ownerCtx, {
    companyId: ids.beta,
    fileName: "Situazione_contabile_Beta_30-06-2026.pdf",
    bytes: await generateSituazioneContabilePdf({ ...idOf(beta), date: "30/06/2026", revenue: 11_900_000, ebit: 380_000, cash: 1_150_000, bankDebt: 8_900_000 }),
    uploadedAt: daysAgo(15),
  });
  await addDocument(ownerCtx, {
    companyId: ids.delta,
    fileName: "Centrale_Rischi_Delta_giugno_2026.pdf",
    bytes: await generateCentraleRischiPdf({
      ...idOf(delta),
      referenceDate: "30/06/2026",
      lines: [
        { bank: "Banca Demo Toscana", category: "Rischi a scadenza", granted: 1_600_000, used: 1_600_000 },
        { bank: "Banca Demo Toscana", category: "Rischi a revoca", granted: 400_000, used: 395_000 },
      ],
    }),
    uploadedAt: daysAgo(10),
  });
  await addDocument(advisorCtx, {
    companyId: ids.gamma,
    fileName: "Contratto_mutuo_Gamma_Banca_Demo_Veneta.pdf",
    bytes: await generateLoanContractPdf({
      ...idOf(gamma),
      bank: "Banca Demo Veneta",
      amount: 800_000,
      rate: 2.1,
      months: 60,
      startDate: isoDate(addDays(inDays(18), -1826)),
      maturityDate: isoDate(inDays(18)),
    }),
    uploadedAt: daysAgo(200),
  });
  await addDocument(advisorCtx, {
    companyId: ids.epsilon,
    fileName: "Business_plan_Epsilon_2026-2028.pdf",
    bytes: await generateBusinessPlanPdf({ ...idOf(epsilon), fromYear: 2026, revenues: [4_900_000, 6_200_000, 7_600_000], ebitda: [1_050_000, 1_400_000, 1_800_000], investments: 1_200_000 }),
    uploadedAt: daysAgo(35),
  });
  documentCount += 5;

  // A visura left to analyse, to try the pipeline from the UI
  const pending = await uploadDocument(ownerCtx, {
    fileName: "Visura_aggiornata_Delta_2026.pdf",
    companyId: ids.delta,
    bytes: await generateVisuraPdf({ ...idOf(delta), reaNumber: "PO-004411", ateco: delta.ateco, sector: delta.sector, foundedYear: delta.foundedYear, legalRepresentative: delta.contact.name }),
  });
  await db.document.update({ where: { id: pending.document.id }, data: { createdAt: daysAgo(0) } });
  documentCount++;
  console.log(`✓ ${documentCount} documenti elaborati dalla pipeline`);

  // Financing operations
  const ops: Record<string, string> = {};
  const op = async (key: string, ctx: ServiceContext, input: Record<string, unknown>, createdAt: Date) => {
    const created = await createOperation(ctx, input);
    ops[key] = created.id;
    await db.financingOperation.update({ where: { id: created.id }, data: { createdAt } });
    await backdate([created.id], createdAt);
    return created;
  };

  await op("alfaMutuo", advisorCtx, {
    companyId: ids.alfa, title: "Mutuo chirografario linea CNC", bank: "Banca Demo Lombarda", type: "MUTUO_CHIROGRAFARIO",
    amount: 1_500_000, rate: 4.35, rateType: "FIXED", durationMonths: 72, status: "DOCUMENTATION", probability: 70,
    guarantee: "Garanzia MCC 60% (da richiedere)", notes: "Investimento in nuova linea CNC a 5 assi. Banca interessata, in attesa di business plan.",
  }, daysAgo(21));
  await op("betaFido", ownerCtx, {
    companyId: ids.beta, title: "Rinegoziazione linee a breve", bank: "Banca Demo Emiliana", type: "FIDO_CASSA",
    amount: 3_000_000, outstandingDebt: 2_750_000, rate: 5.1, rateType: "VARIABLE", status: "NEGOTIATION", probability: 60,
    notes: "Obiettivo: consolidare parte del breve su medio termine per recuperare DSCR.",
  }, daysAgo(40));
  await op("betaMcc", ownerCtx, {
    companyId: ids.beta, title: "Finanziamento garantito MCC 2 M€", bank: "Credito Demo Padano", type: "FINANZIAMENTO_GARANTITO",
    amount: 2_000_000, rate: 4.8, rateType: "FIXED", durationMonths: 60, status: "ANALYSIS", probability: 40,
  }, daysAgo(12));
  await op("gammaMutuo", advisorCtx, {
    companyId: ids.gamma, title: "Mutuo chirografario 2021", bank: "Banca Demo Veneta", type: "MUTUO_CHIROGRAFARIO",
    amount: 800_000, outstandingDebt: 95_000, rate: 2.1, rateType: "FIXED", durationMonths: 60,
    startDate: isoDate(addDays(inDays(18), -1826)), maturityDate: isoDate(inDays(18)), status: "COMPLETED", withChecklist: false,
    notes: "Ultima rata in scadenza: valutare rifinanziamento per investimenti flotta.",
  }, daysAgo(1800));
  await op("gammaLeasing", advisorCtx, {
    companyId: ids.gamma, title: "Leasing automezzi", bank: "Leasing Demo S.p.A.", type: "LEASING",
    amount: 420_000, outstandingDebt: 160_000, rate: 3.4, rateType: "FIXED", durationMonths: 48,
    startDate: isoDate(addDays(inDays(210), -1461)), maturityDate: isoDate(inDays(210)), status: "COMPLETED", withChecklist: false,
  }, daysAgo(1250));
  await op("deltaRiscadenzamento", ownerCtx, {
    companyId: ids.delta, title: "Riscadenzamento mutuo in essere", bank: "Banca Demo Toscana", type: "MUTUO_CHIROGRAFARIO",
    amount: 600_000, status: "LEAD", probability: 30, notes: "Richiesta allungamento durata di 24 mesi.",
  }, daysAgo(6));
  await op("deltaMutuo", ownerCtx, {
    companyId: ids.delta, title: "Mutuo chirografario 2022", bank: "Banca Demo Toscana", type: "MUTUO_CHIROGRAFARIO",
    amount: 1_600_000, outstandingDebt: 1_100_000, rate: 3.2, rateType: "VARIABLE", durationMonths: 84,
    startDate: "2022-03-01", maturityDate: isoDate(inDays(400)), status: "COMPLETED", withChecklist: false,
  }, daysAgo(1300));
  await op("epsilonRS", advisorCtx, {
    companyId: ids.epsilon, title: "Finanziamento agevolato R&S", bank: "Banca Demo Digitale", type: "FINANZIAMENTO_GARANTITO",
    amount: 750_000, rate: 1.9, rateType: "FIXED", durationMonths: 72, status: "SUBMITTED", probability: 75,
    guarantee: "Fondo di garanzia PMI 80%", notes: "Pratica presentata; progetto di sviluppo nuova piattaforma.",
  }, daysAgo(30));

  // Checklist states
  const setItem = (operationId: string, name: string, data: Parameters<typeof db.financingDocument.updateMany>[0]["data"]) =>
    db.financingDocument.updateMany({ where: { operationId, name }, data });
  await setItem(ops.alfaMutuo, "Business plan", { status: "REQUESTED", requestedAt: daysAgo(5), dueDate: inDays(3) });
  await setItem(ops.alfaMutuo, "Documento d'identità legale rappresentante", { status: "RECEIVED", receivedAt: daysAgo(15) });
  await setItem(ops.betaFido, "Documento d'identità legale rappresentante", { status: "REQUESTED", requestedAt: daysAgo(10), dueDate: inDays(-2) });
  await setItem(ops.epsilonRS, "Situazione contabile aggiornata", { status: "RECEIVED", receivedAt: daysAgo(28) });
  await setItem(ops.epsilonRS, "Centrale Rischi Banca d'Italia", { status: "RECEIVED", receivedAt: daysAgo(28) });
  await setItem(ops.epsilonRS, "Documento d'identità legale rappresentante", { status: "VERIFIED", receivedAt: daysAgo(29) });
  await setItem(ops.epsilonRS, "Bilancio esercizio precedente", { status: "VERIFIED" });
  console.log(`✓ ${Object.keys(ops).length} operazioni finanziarie`);

  // Tasks
  const task = async (ctx: ServiceContext, input: Record<string, unknown>, createdDaysAgo: number) => {
    const t = await createTask(ctx, input);
    await db.task.update({ where: { id: t.id }, data: { createdAt: daysAgo(createdDaysAgo) } });
    await backdate([t.id], daysAgo(createdDaysAgo));
    return t;
  };
  const alfaBpItem = await db.financingDocument.findFirst({ where: { operationId: ops.alfaMutuo, name: "Business plan" } });
  const due = (n: number) => inDays(n).toISOString();

  await task(advisorCtx, { title: "Verificare i dati estratti dal bilancio 2025 di Alfa", companyId: ids.alfa, assigneeId: advisor.id, priority: "HIGH", dueDate: due(0) }, 1);
  await task(advisorCtx, { title: "Sollecitare business plan 2026-2028 ad Alfa", companyId: ids.alfa, operationId: ops.alfaMutuo, financingDocumentId: alfaBpItem?.id, assigneeId: analyst.id, priority: "MEDIUM", dueDate: due(3) }, 5);
  await task(advisorCtx, { title: "Analizzare l'impatto del nuovo mutuo su PFN/EBITDA", companyId: ids.alfa, operationId: ops.alfaMutuo, assigneeId: advisor.id, priority: "HIGH", dueDate: due(2), status: "IN_PROGRESS" }, 4);
  await task(advisorCtx, { title: "Preparare incontro con l'amministratore di Alfa sul piano investimenti", companyId: ids.alfa, assigneeId: advisor.id, priority: "MEDIUM", dueDate: due(6) }, 3);
  await task(ownerCtx, { title: "Simulare DSCR con consolidamento delle linee a breve", companyId: ids.beta, operationId: ops.betaFido, assigneeId: owner.id, priority: "HIGH", dueDate: due(0), status: "IN_PROGRESS" }, 7);
  await task(ownerCtx, { title: "Inviare documentazione aggiornata a Banca Demo Emiliana", companyId: ids.beta, operationId: ops.betaFido, assigneeId: owner.id, priority: "HIGH", dueDate: due(-1) }, 9);
  await task(ownerCtx, { title: "Attendere delibera del comitato crediti", companyId: ids.beta, operationId: ops.betaFido, assigneeId: owner.id, priority: "MEDIUM", dueDate: due(10), status: "WAITING" }, 8);
  await task(ownerCtx, { title: "Raccogliere situazione contabile al 30/06", companyId: ids.beta, assigneeId: analyst.id, priority: "MEDIUM", dueDate: due(-16), status: "DONE" }, 25);
  await task(advisorCtx, { title: "Pianificare il rifinanziamento del mutuo in scadenza", companyId: ids.gamma, operationId: ops.gammaMutuo, assigneeId: advisor.id, priority: "CRITICAL", dueDate: due(5) }, 2);
  await task(advisorCtx, { title: "Confrontare offerte per rinnovo leasing automezzi", companyId: ids.gamma, operationId: ops.gammaLeasing, assigneeId: analyst.id, priority: "LOW", dueDate: due(14) }, 2);
  await task(ownerCtx, { title: "Chiamare l'imprenditore per il piano di tesoreria a 13 settimane", companyId: ids.delta, assigneeId: owner.id, priority: "HIGH", dueDate: due(-3) }, 8);
  await task(ownerCtx, { title: "Valutare moratoria / riscadenzamento con Banca Demo Toscana", companyId: ids.delta, operationId: ops.deltaRiscadenzamento, assigneeId: owner.id, priority: "HIGH", dueDate: due(4) }, 6);
  await task(ownerCtx, { title: "Richiedere situazione contabile aggiornata a Delta", companyId: ids.delta, assigneeId: analyst.id, priority: "MEDIUM", dueDate: due(2), status: "WAITING" }, 6);
  await task(advisorCtx, { title: "Monitorare esito domanda di finanziamento agevolato", companyId: ids.epsilon, operationId: ops.epsilonRS, assigneeId: advisor.id, priority: "LOW", dueDate: due(20), status: "WAITING" }, 30);
  await task(advisorCtx, { title: "Proporre piano di impiego della liquidità in eccesso", companyId: ids.epsilon, assigneeId: advisor.id, priority: "MEDIUM", dueDate: due(9) }, 4);
  await task(ownerCtx, { title: "Rivedere le soglie di alert dello studio per il trimestre", assigneeId: owner.id, priority: "LOW", dueDate: due(30) }, 10);
  console.log("✓ 16 task");

  // Second organization (tenant isolation demo)
  const other = await db.organization.create({ data: { name: "Studio Esempio", slug: "studio-esempio" } });
  const otherOwner = await db.user.create({
    data: { organizationId: other.id, email: "luca.neri@studioesempio.demo", name: "Luca Neri", role: "OWNER", passwordHash },
  });
  const otherCtx: ServiceContext = { userId: otherOwner.id, userName: otherOwner.name, organizationId: other.id, role: "OWNER" };
  const omega = await createCompany(otherCtx, { name: "Omega Servizi S.r.l.", vatNumber: "99900000099", city: "Torino", province: "TO", sector: "Servizi alle imprese" });
  await createStatement(otherCtx, omega.id, {
    fiscalYear: 2025,
    values: values({ revenue: 4_000_000, ebit: 300_000, depreciation: 100_000, netIncome: 180_000, cash: 500_000, financialDebt: 1_200_000, equity: 1_000_000, currentAssets: 1_800_000, currentLiabilities: 1_300_000, inventory: 200_000, totalAssets: 3_000_000, interestExpense: 50_000, principalRepayment: 250_000 }),
  });
  await createTask(otherCtx, { title: "Task riservato a Studio Esempio", companyId: omega.id, priority: "MEDIUM", dueDate: due(2) });

  const [alerts] = await Promise.all([syncAlerts(org.id), syncAlerts(other.id)]);
  console.log(`✓ alert engine: ${alerts.total} alert attivi\n`);

  console.log("Accesso demo (password per tutti gli utenti: " + DEMO_PASSWORD + ")");
  console.log("  Owner   giulia.ferri@gifinance.demo");
  console.log("  Advisor marco.bellini@gifinance.demo");
  console.log("  Analyst sara.colombo@gifinance.demo");
  console.log("  Altra organizzazione (isolamento): luca.neri@studioesempio.demo");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
