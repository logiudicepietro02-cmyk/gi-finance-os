import { describe, expect, it } from "vitest";
import { NOT_AVAILABLE, STATEMENT_FIELDS, type StatementValues } from "@/lib/financial/fields";
import { RATIO_KEYS, computeRatio, computeRatios } from "@/lib/financial/ratios";
import { formatRatio } from "@/lib/financial/format";
import { computeVariations, significantChanges } from "@/lib/financial/variations";

const base: StatementValues = {
  revenue: 10_000_000,
  ebitda: 1_500_000,
  ebit: 1_000_000,
  netIncome: 600_000,
  cash: 800_000,
  financialDebt: 4_800_000,
  equity: 3_000_000,
  currentAssets: 5_000_000,
  currentLiabilities: 4_000_000,
  inventory: 1_200_000,
  interestExpense: 200_000,
  principalRepayment: 800_000,
  depreciation: 500_000,
};

describe("financial ratios — happy path", () => {
  it.each([
    ["ebitda_margin", 0.15],
    ["ebit_margin", 0.1],
    ["net_debt", 4_000_000],
    ["net_debt_to_ebitda", 2.666667],
    ["debt_to_ebitda", 3.2],
    ["current_ratio", 1.25],
    ["quick_ratio", 0.95],
    ["interest_coverage", 5],
    ["dscr", 1.5],
    ["net_debt_to_equity", 1.333333],
  ] as const)("%s = %d", (key, expected) => {
    const r = computeRatio(key, base);
    expect(r.status).toBe("OK");
    expect(r.value).toBeCloseTo(expected, 6);
    expect(r.missing).toEqual([]);
  });

  it("exposes formula and inputs for every ratio", () => {
    for (const r of computeRatios(base)) {
      expect(r.formula.length).toBeGreaterThan(3);
      expect(r.inputs.length).toBeGreaterThan(0);
      expect(r.inputs.every((i) => typeof i.value === "number")).toBe(true);
    }
  });

  it("computes all ratio keys", () => {
    expect(computeRatios(base).map((r) => r.key)).toEqual([...RATIO_KEYS]);
  });

  it("net debt uses financial debt minus cash as inputs", () => {
    const r = computeRatio("net_debt", base);
    expect(r.inputs.map((i) => i.field)).toEqual(["financialDebt", "cash"]);
  });
});

describe("financial ratios — missing data is never invented", () => {
  it("returns MISSING with 'Dato non disponibile' when an input is absent", () => {
    const r = computeRatio("ebitda_margin", { ...base, revenue: null });
    expect(r.status).toBe("MISSING");
    expect(r.value).toBeNull();
    expect(r.missing).toEqual(["revenue"]);
    expect(r.note).toContain(NOT_AVAILABLE);
    expect(formatRatio(r)).toBe(NOT_AVAILABLE);
  });

  it("DSCR requires principal repayment", () => {
    const r = computeRatio("dscr", { ...base, principalRepayment: undefined });
    expect(r.status).toBe("MISSING");
    expect(r.missing).toContain("principalRepayment");
  });

  it("quick ratio requires inventory", () => {
    expect(computeRatio("quick_ratio", { ...base, inventory: null }).status).toBe("MISSING");
  });

  it("empty statement → every ratio MISSING", () => {
    for (const r of computeRatios({})) {
      expect(r.status).toBe("MISSING");
      expect(r.value).toBeNull();
    }
  });

  it("falls back to reported PFN when debt/cash components are missing", () => {
    const r = computeRatio("net_debt_to_ebitda", { ebitda: 1_000_000, netFinancialPosition: 2_500_000 });
    expect(r.status).toBe("OK");
    expect(r.value).toBe(2.5);
    expect(r.note).toMatch(/PFN riportata/);
  });

  it("reports both net debt components as missing", () => {
    const r = computeRatio("net_debt", { ebitda: 1 });
    expect(r.status).toBe("MISSING");
    expect(r.missing).toEqual(["financialDebt", "cash"]);
  });
});

describe("financial ratios — not meaningful cases", () => {
  it("negative EBITDA → PFN/EBITDA not meaningful", () => {
    const r = computeRatio("net_debt_to_ebitda", { ...base, ebitda: -200_000 });
    expect(r.status).toBe("NOT_MEANINGFUL");
    expect(r.value).toBeNull();
    expect(formatRatio(r)).toBe("n.s.");
  });

  it("zero revenue → margins not meaningful", () => {
    expect(computeRatio("ebitda_margin", { ...base, revenue: 0 }).status).toBe("NOT_MEANINGFUL");
    expect(computeRatio("ebit_margin", { ...base, revenue: 0 }).status).toBe("NOT_MEANINGFUL");
  });

  it("zero interest → coverage not meaningful", () => {
    expect(computeRatio("interest_coverage", { ...base, interestExpense: 0 }).status).toBe("NOT_MEANINGFUL");
  });

  it("zero debt service → DSCR not meaningful", () => {
    expect(computeRatio("dscr", { ...base, interestExpense: 0, principalRepayment: 0 }).status).toBe("NOT_MEANINGFUL");
  });

  it("negative EBITDA gives a negative (meaningful) DSCR", () => {
    const r = computeRatio("dscr", { ...base, ebitda: -500_000 });
    expect(r.status).toBe("OK");
    expect(r.value).toBe(-0.5);
  });

  it("negative equity → PFN/PN not meaningful", () => {
    expect(computeRatio("net_debt_to_equity", { ...base, equity: -10 }).status).toBe("NOT_MEANINGFUL");
  });

  it("net cash position is a negative net debt", () => {
    expect(computeRatio("net_debt", { ...base, cash: 6_000_000 }).value).toBe(-1_200_000);
  });

  it("never returns NaN or Infinity (randomized inputs)", () => {
    const samples = [0, -1, 1, null, 1e9, -1e9, 0.0001];
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 500; i++) {
      const values: StatementValues = {};
      for (const f of STATEMENT_FIELDS) values[f] = samples[Math.floor(rand() * samples.length)];
      for (const r of computeRatios(values)) {
        if (r.value !== null) expect(Number.isFinite(r.value)).toBe(true);
        if (r.status !== "OK") expect(r.value).toBeNull();
      }
    }
  });
});

describe("variations", () => {
  const previous: StatementValues = { ...base, revenue: 8_500_000, ebitda: 1_450_000, financialDebt: 3_000_000 };

  it("computes deltas and favorability", () => {
    const vars = computeVariations(base, previous);
    const revenue = vars.find((v) => v.key === "revenue")!;
    expect(revenue.delta).toBe(1_500_000);
    expect(revenue.deltaPct).toBeCloseTo(0.176470, 5);
    expect(revenue.favorable).toBe(true);
    const debt = vars.find((v) => v.key === "financialDebt")!;
    expect(debt.favorable).toBe(false);
    const leverage = vars.find((v) => v.key === "net_debt_to_ebitda")!;
    expect(leverage.favorable).toBe(false);
  });

  it("flags significant changes with direction", () => {
    const changes = significantChanges(computeVariations(base, previous));
    const keys = changes.map((c) => c.key);
    expect(keys).toContain("revenue");
    expect(keys).toContain("net_debt_to_ebitda");
    expect(changes.find((c) => c.key === "net_debt_to_ebitda")!.severity).toBe("WARNING");
  });

  it("does not compare when a value is missing", () => {
    const vars = computeVariations({ ...base, revenue: null }, previous);
    expect(vars.find((v) => v.key === "revenue")!.delta).toBeNull();
  });
});
