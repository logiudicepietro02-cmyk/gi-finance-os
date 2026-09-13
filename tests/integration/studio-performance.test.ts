import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/permissions";
import { createCompany } from "@/services/companies";
import { createOperation } from "@/services/operations";
import { getStudioPerformance } from "@/services/studio-performance";
import { createOrgFixture, deleteOrg, uniqueVat } from "./helpers";

type Fixture = Awaited<ReturnType<typeof createOrgFixture>>;

let org: Fixture;

beforeAll(async () => {
  org = await createOrgFixture("Performance");
  const company = await createCompany(org.owner, { name: "Performance Studio S.r.l.", vatNumber: uniqueVat() });

  // Closed this month: fixed fee, no discount -> feeRevenue this month = 5000.
  await createOperation(org.owner, {
    companyId: company.id,
    title: "Mutuo chiuso",
    bank: "Banca A",
    type: "MUTUO_CHIROGRAFARIO",
    status: "COMPLETED",
    withChecklist: false,
    feeType: "FIXED",
    feeValue: 5000,
  });

  // Still open: percentage fee on the operation amount contributes to pipelineValue.
  await createOperation(org.owner, {
    companyId: company.id,
    title: "Leasing in trattativa",
    bank: "Banca B",
    type: "LEASING",
    status: "NEGOTIATION",
    withChecklist: false,
    amount: 100_000,
    feeType: "PERCENTAGE",
    feeValue: 2,
  });

  // Active retainer, started last month -> counts toward activeMrr.
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  await createOperation(org.owner, {
    companyId: company.id,
    title: "Consulenza ricorrente",
    bank: "Banca C",
    type: "LEASING",
    status: "DOCUMENTATION",
    withChecklist: false,
    monthlyRetainer: 300,
    retainerActive: true,
    retainerStartDate: lastMonth.toISOString().slice(0, 10),
  });
});

afterAll(async () => {
  await deleteOrg(org.org.id);
});

describe("getStudioPerformance", () => {
  it("aggregates closed fees, pipeline value and active MRR for the organization", async () => {
    const perf = await getStudioPerformance(org.owner);
    const thisMonth = perf.monthlyTrend.at(-1)!;
    expect(thisMonth.feeRevenue).toBeCloseTo(5000, 6);
    expect(perf.pipelineValue).toBeCloseTo(2000, 6); // 2% of 100,000
    expect(perf.activeMrr).toBe(300);
  });

  it("is forbidden for the analyst role (requires operation:write)", async () => {
    await expect(getStudioPerformance(org.analyst)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
