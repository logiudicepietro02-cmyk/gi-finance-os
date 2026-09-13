import crypto from "node:crypto";
import { db } from "@/lib/db";
import type { DemoFinancials } from "@/lib/documents/demo-pdf";
import type { ServiceContext } from "@/services/context";

export async function createOrgFixture(label: string) {
  const suffix = crypto.randomBytes(4).toString("hex");
  const org = await db.organization.create({ data: { name: `${label} ${suffix}`, slug: `test-${label.toLowerCase()}-${suffix}` } });
  const make = async (role: "OWNER" | "ADVISOR" | "ANALYST") => {
    const user = await db.user.create({
      data: { organizationId: org.id, email: `${role.toLowerCase()}-${suffix}@${label.toLowerCase()}.test`, name: `${role} ${label}`, role, passwordHash: "x" },
    });
    return { userId: user.id, userName: user.name, organizationId: org.id, role } satisfies ServiceContext;
  };
  return { org, owner: await make("OWNER"), advisor: await make("ADVISOR"), analyst: await make("ANALYST"), suffix };
}

export async function deleteOrg(organizationId: string) {
  await db.organization.deleteMany({ where: { id: organizationId } });
}

export function uniqueVat(): string {
  return `98${String(crypto.randomInt(0, 1e9)).padStart(9, "0")}`;
}

export const SAMPLE_FINANCIALS: Record<number, DemoFinancials> = {
  2024: { revenue: 10_400_000, ebit: 900_000, depreciation: 450_000, netIncome: 510_000, cash: 900_000, financialDebt: 4_900_000, equity: 3_300_000, currentAssets: 4_800_000, currentLiabilities: 3_800_000, inventory: 1_350_000, totalAssets: 11_200_000, interestExpense: 170_000, principalRepayment: 640_000 },
  2025: { revenue: 11_300_000, ebit: 790_000, depreciation: 560_000, netIncome: 380_000, cash: 650_000, financialDebt: 6_600_000, equity: 3_600_000, currentAssets: 5_200_000, currentLiabilities: 4_500_000, inventory: 1_600_000, totalAssets: 13_100_000, interestExpense: 260_000, principalRepayment: 740_000 },
};
