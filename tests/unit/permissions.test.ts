import { describe, expect, it } from "vitest";
import { ForbiddenError, PERMISSIONS, assertCan, can } from "@/lib/permissions";

describe("RBAC matrix", () => {
  it("owner has every permission", () => {
    for (const p of PERMISSIONS) expect(can("OWNER", p)).toBe(true);
  });

  it("advisor manages clients and approvals but not org settings", () => {
    expect(can("ADVISOR", "company:write")).toBe(true);
    expect(can("ADVISOR", "financials:approve")).toBe(true);
    expect(can("ADVISOR", "approval:decide")).toBe(true);
    expect(can("ADVISOR", "operation:write")).toBe(true);
    expect(can("ADVISOR", "settings:manage")).toBe(false);
    expect(can("ADVISOR", "users:manage")).toBe(false);
    expect(can("ADVISOR", "company:delete")).toBe(false);
  });

  it("analyst works on documents and tasks but cannot approve or change operations", () => {
    expect(can("ANALYST", "document:write")).toBe(true);
    expect(can("ANALYST", "task:write")).toBe(true);
    expect(can("ANALYST", "ai:use")).toBe(true);
    expect(can("ANALYST", "financials:approve")).toBe(false);
    expect(can("ANALYST", "approval:decide")).toBe(false);
    expect(can("ANALYST", "operation:write")).toBe(false);
    expect(can("ANALYST", "company:write")).toBe(false);
    expect(can("ANALYST", "audit:read")).toBe(false);
  });

  it("every role can read the core entities", () => {
    for (const role of ["OWNER", "ADVISOR", "ANALYST"] as const) {
      expect(can(role, "company:read")).toBe(true);
      expect(can(role, "operation:read")).toBe(true);
      expect(can(role, "task:read")).toBe(true);
    }
  });

  it("assertCan throws ForbiddenError with status 403", () => {
    expect(() => assertCan("ANALYST", "settings:manage")).toThrow(ForbiddenError);
    try {
      assertCan("ANALYST", "settings:manage");
    } catch (e) {
      expect((e as ForbiddenError).status).toBe(403);
    }
  });

  it("unknown role has no permissions", () => {
    expect(can("GUEST" as never, "company:read")).toBe(false);
  });
});
