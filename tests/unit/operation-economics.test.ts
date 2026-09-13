import { describe, expect, it } from "vitest";
import { applyDiscount, netFeeAmount, netMonthlyRetainer, resolveGrossFee } from "@/lib/economics/fee";
import { computeStudioPerformance } from "@/lib/economics/performance";

describe("resolveGrossFee", () => {
  it("returns the fixed value as-is", () => {
    expect(resolveGrossFee({ feeType: "FIXED", feeValue: 2500, operationAmount: 100_000 })).toBe(2500);
  });

  it("computes a percentage of the operation amount", () => {
    expect(resolveGrossFee({ feeType: "PERCENTAGE", feeValue: 1.5, operationAmount: 100_000 })).toBeCloseTo(1500, 6);
  });

  it("returns null when a percentage fee has no operation amount", () => {
    expect(resolveGrossFee({ feeType: "PERCENTAGE", feeValue: 1.5, operationAmount: null })).toBeNull();
  });

  it("returns null when feeType or feeValue is missing", () => {
    expect(resolveGrossFee({ feeType: null, feeValue: 2500, operationAmount: 100_000 })).toBeNull();
    expect(resolveGrossFee({ feeType: "FIXED", feeValue: null, operationAmount: 100_000 })).toBeNull();
  });
});

describe("applyDiscount", () => {
  it("reduces proportionally for a percentage discount", () => {
    expect(applyDiscount(1000, "PERCENTAGE", 10)).toBeCloseTo(900, 6);
  });

  it("subtracts a fixed discount", () => {
    expect(applyDiscount(1000, "FIXED", 200)).toBe(800);
  });

  it("clamps a fixed discount larger than the gross amount to 0", () => {
    expect(applyDiscount(1000, "FIXED", 5000)).toBe(0);
  });

  it("returns the gross amount unchanged when no discount is set", () => {
    expect(applyDiscount(1000, null, null)).toBe(1000);
  });

  it("returns null when the gross amount is null", () => {
    expect(applyDiscount(null, "PERCENTAGE", 10)).toBeNull();
  });
});

describe("netFeeAmount / netMonthlyRetainer", () => {
  it("combines gross fee resolution and discount", () => {
    const net = netFeeAmount({ amount: 100_000, feeType: "PERCENTAGE", feeValue: 2, feeDiscountType: "PERCENTAGE", feeDiscountValue: 25 });
    expect(net).toBeCloseTo(1500, 6); // 2% of 100k = 2000, -25% = 1500
  });

  it("combines retainer and its own discount", () => {
    const net = netMonthlyRetainer({ monthlyRetainer: 500, retainerDiscountType: "FIXED", retainerDiscountValue: 100 });
    expect(net).toBe(400);
  });
});

describe("computeStudioPerformance", () => {
  const now = new Date(2026, 5, 15); // 15 giugno 2026

  it("attributes fee revenue to the month the operation closed", () => {
    const result = computeStudioPerformance(
      [
        {
          amount: 200_000,
          status: "COMPLETED",
          closedAt: new Date(2026, 5, 3),
          feeType: "PERCENTAGE",
          feeValue: 1,
          feeDiscountType: null,
          feeDiscountValue: null,
          monthlyRetainer: null,
          retainerActive: false,
          retainerStartDate: null,
          retainerEndDate: null,
          retainerDiscountType: null,
          retainerDiscountValue: null,
        },
      ],
      { now, months: 3 },
    );
    const june = result.monthlyTrend.at(-1)!;
    expect(june.feeRevenue).toBeCloseTo(2000, 6);
    expect(result.pipelineValue).toBe(0);
  });

  it("spreads retainer revenue across every covered month and counts active MRR", () => {
    const result = computeStudioPerformance(
      [
        {
          amount: null,
          status: "DOCUMENTATION",
          closedAt: null,
          feeType: null,
          feeValue: null,
          feeDiscountType: null,
          feeDiscountValue: null,
          monthlyRetainer: 300,
          retainerActive: true,
          retainerStartDate: new Date(2026, 3, 10),
          retainerEndDate: null,
          retainerDiscountType: null,
          retainerDiscountValue: null,
        },
      ],
      { now, months: 3 },
    );
    expect(result.monthlyTrend.map((p) => p.retainerRevenue)).toEqual([300, 300, 300]);
    expect(result.activeMrr).toBe(300);
  });

  it("sums the net fee of open operations into the pipeline value", () => {
    const result = computeStudioPerformance(
      [
        {
          amount: 50_000,
          status: "NEGOTIATION",
          closedAt: null,
          feeType: "FIXED",
          feeValue: 3000,
          feeDiscountType: "PERCENTAGE",
          feeDiscountValue: 10,
          monthlyRetainer: null,
          retainerActive: false,
          retainerStartDate: null,
          retainerEndDate: null,
          retainerDiscountType: null,
          retainerDiscountValue: null,
        },
      ],
      { now, months: 3 },
    );
    expect(result.pipelineValue).toBeCloseTo(2700, 6);
  });
});
