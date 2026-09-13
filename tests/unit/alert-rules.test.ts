import { describe, expect, it } from "vitest";
import { daysUntil, evaluateAlertRules, type AlertRuleInput } from "@/lib/alerts/rules";
import { DEFAULT_ORG_SETTINGS, parseOrgSettings } from "@/lib/settings";

const now = new Date(2026, 8, 11, 9, 0); // 11 Sep 2026
const addDays = (d: number) => new Date(2026, 8, 11 + d, 12, 0);

function input(overrides: Partial<AlertRuleInput> = {}): AlertRuleInput {
  return { now, settings: DEFAULT_ORG_SETTINGS, companies: [], operations: [], tasks: [], ...overrides };
}

const statement = (values: Record<string, number>) => ({ id: "st1", fiscalYear: 2025, values });

describe("daysUntil", () => {
  it("counts calendar days regardless of time", () => {
    expect(daysUntil(now, addDays(18))).toBe(18);
    expect(daysUntil(now, addDays(-1))).toBe(-1);
    expect(daysUntil(now, new Date(2026, 8, 11, 23, 59))).toBe(0);
  });
});

describe("DSCR rule", () => {
  it("fires below threshold, CRITICAL under 1", () => {
    const alerts = evaluateAlertRules(
      input({
        companies: [
          { id: "c1", name: "A", latestStatement: statement({ ebitda: 900_000, interestExpense: 200_000, principalRepayment: 800_000 }) },
          { id: "c2", name: "B", latestStatement: statement({ ebitda: 1_100_000, interestExpense: 200_000, principalRepayment: 800_000 }) },
          { id: "c3", name: "C", latestStatement: statement({ ebitda: 2_000_000, interestExpense: 200_000, principalRepayment: 800_000 }) },
        ],
      }),
    ).filter((a) => a.type === "DSCR_BELOW_THRESHOLD");
    expect(alerts.map((a) => [a.companyId, a.severity])).toEqual([
      ["c1", "CRITICAL"],
      ["c2", "WARNING"],
    ]);
    expect(alerts[0].dedupeKey).toBe("DSCR_BELOW_THRESHOLD:c1");
    expect(alerts[0].message).toContain("2025");
  });

  it("does not fire when DSCR is not available", () => {
    const alerts = evaluateAlertRules(input({ companies: [{ id: "c1", name: "A", latestStatement: statement({ ebitda: 1 }) }] }));
    expect(alerts).toHaveLength(0);
  });

  it("respects configured threshold", () => {
    const alerts = evaluateAlertRules(
      input({
        settings: parseOrgSettings({ dscrMin: 2 }),
        companies: [{ id: "c1", name: "A", latestStatement: statement({ ebitda: 1_500_000, interestExpense: 200_000, principalRepayment: 800_000 }) }],
      }),
    );
    expect(alerts.some((a) => a.type === "DSCR_BELOW_THRESHOLD")).toBe(true);
  });
});

describe("PFN/EBITDA rule", () => {
  it("fires above threshold", () => {
    const alerts = evaluateAlertRules(
      input({ companies: [{ id: "c1", name: "A", latestStatement: statement({ financialDebt: 5_000_000, cash: 500_000, ebitda: 1_000_000 }) }] }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("NET_DEBT_EBITDA_ABOVE_THRESHOLD");
    expect(alerts[0].severity).toBe("WARNING");
  });

  it("negative EBITDA with positive net debt is CRITICAL", () => {
    const alerts = evaluateAlertRules(
      input({ companies: [{ id: "c1", name: "A", latestStatement: statement({ financialDebt: 2_000_000, cash: 100_000, ebitda: -50_000 }) }] }),
    );
    expect(alerts[0].severity).toBe("CRITICAL");
  });

  it("no alert for net cash position with negative EBITDA", () => {
    const alerts = evaluateAlertRules(
      input({ companies: [{ id: "c1", name: "A", latestStatement: statement({ financialDebt: 100_000, cash: 900_000, ebitda: -50_000 }) }] }),
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("maturity rule", () => {
  const op = (id: string, days: number | null, status = "COMPLETED") => ({
    id,
    companyId: "c1",
    title: `Op ${id}`,
    bank: "Banca Demo",
    status,
    maturityDate: days === null ? null : addDays(days),
    checklist: [],
  });

  it("fires within the window, CRITICAL within 30 days", () => {
    const alerts = evaluateAlertRules(
      input({ operations: [op("a", 18), op("b", 45), op("c", 90), op("d", -3), op("e", null), op("f", 10, "REJECTED")] }),
    );
    expect(alerts.map((a) => [a.sourceId, a.severity])).toEqual([
      ["a", "CRITICAL"],
      ["b", "WARNING"],
    ]);
    expect(alerts[0].title).toContain("18 giorni");
  });
});

describe("missing documents rule", () => {
  it("fires only in document-collection stages for required items", () => {
    const checklist = [
      { id: "i1", name: "Bilancio", required: true, status: "RECEIVED", dueDate: null },
      { id: "i2", name: "Business plan", required: true, status: "MISSING", dueDate: addDays(-2) },
      { id: "i3", name: "Situazione contabile", required: true, status: "REQUESTED", dueDate: addDays(5) },
      { id: "i4", name: "Facoltativo", required: false, status: "MISSING", dueDate: null },
    ];
    const alerts = evaluateAlertRules(
      input({
        operations: [
          { id: "o1", companyId: "c1", title: "Mutuo", bank: "B", status: "DOCUMENTATION", maturityDate: null, checklist },
          { id: "o2", companyId: "c1", title: "Lead", bank: "B", status: "LEAD", maturityDate: null, checklist },
        ],
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("CRITICAL");
    expect(alerts[0].message).toContain("Business plan");
    expect(alerts[0].message).toContain("Situazione contabile");
    expect(alerts[0].message).not.toContain("Facoltativo");
  });
});

describe("task overdue rule", () => {
  it("fires for open tasks past due date", () => {
    const alerts = evaluateAlertRules(
      input({
        tasks: [
          { id: "t1", companyId: "c1", title: "Chiamare banca", status: "TODO", priority: "HIGH", dueDate: addDays(-2) },
          { id: "t2", companyId: "c1", title: "Fatto", status: "DONE", priority: "HIGH", dueDate: addDays(-2) },
          { id: "t3", companyId: null, title: "Oggi", status: "TODO", priority: "LOW", dueDate: addDays(0) },
          { id: "t4", companyId: null, title: "Ieri", status: "WAITING", priority: "LOW", dueDate: addDays(-1) },
        ],
      }),
    );
    expect(alerts.map((a) => [a.sourceId, a.severity])).toEqual([
      ["t1", "CRITICAL"],
      ["t4", "WARNING"],
    ]);
  });
});

describe("settings parsing", () => {
  it("keeps valid keys and falls back per key", () => {
    expect(parseOrgSettings({ dscrMin: 1.5, netDebtEbitdaMax: "x" })).toEqual({ ...DEFAULT_ORG_SETTINGS, dscrMin: 1.5 });
    expect(parseOrgSettings(null)).toEqual(DEFAULT_ORG_SETTINGS);
  });
});
