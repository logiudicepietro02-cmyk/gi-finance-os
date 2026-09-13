import { computeStudioPerformance, type StudioPerformance } from "@/lib/economics/performance";
import { db } from "@/lib/db";
import { authorize, type ServiceContext } from "./context";

export type { StudioPerformance } from "@/lib/economics/performance";

/** Andamento economico dello studio: fee da pratiche chiuse, retainer ricorrenti, valore di pipeline. */
export async function getStudioPerformance(ctx: ServiceContext): Promise<StudioPerformance> {
  authorize(ctx, "operation:write");
  const operations = await db.financingOperation.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      amount: true,
      status: true,
      closedAt: true,
      feeType: true,
      feeValue: true,
      feeDiscountType: true,
      feeDiscountValue: true,
      monthlyRetainer: true,
      retainerActive: true,
      retainerStartDate: true,
      retainerEndDate: true,
      retainerDiscountType: true,
      retainerDiscountValue: true,
    },
  });
  return computeStudioPerformance(operations);
}
