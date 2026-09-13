import { expect, request, type APIRequestContext } from "@playwright/test";

export const PASSWORD = "GiFinance2026!";
export const USERS = {
  owner: "giulia.ferri@gifinance.demo",
  advisor: "marco.bellini@gifinance.demo",
  analyst: "sara.colombo@gifinance.demo",
  otherOrg: "luca.neri@studioesempio.demo",
} as const;

export async function apiAs(baseURL: string, who: keyof typeof USERS): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/auth/login", { data: { email: USERS[who], password: PASSWORD } });
  expect(res.status(), await res.text()).toBe(200);
  return ctx;
}

export function uniqueVat(): string {
  return `97${String(Date.now()).slice(-9)}`;
}
