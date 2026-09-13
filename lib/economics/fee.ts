/** Studio-side economics on a FinancingOperation (fee di mediazione, sconti, retainer). Pure: no I/O. */
import { toNumber } from "@/lib/financial/fields";

export type FeeTypeKey = "FIXED" | "PERCENTAGE";
export type DiscountTypeKey = "PERCENTAGE" | "FIXED";

/** Resolves the gross mediation fee: FIXED → feeValue; PERCENTAGE → operationAmount * feeValue / 100. */
export function resolveGrossFee(input: { feeType: FeeTypeKey | null | undefined; feeValue: unknown; operationAmount: unknown }): number | null {
  const feeValue = toNumber(input.feeValue);
  if (input.feeType == null || feeValue === null) return null;
  if (input.feeType === "FIXED") return feeValue;
  const amount = toNumber(input.operationAmount);
  if (amount === null) return null;
  return (amount * feeValue) / 100;
}

/** Applies a discount to a gross amount. PERCENTAGE reduces proportionally; FIXED subtracts, clamped at 0. */
export function applyDiscount(gross: number | null, discountType: DiscountTypeKey | null | undefined, discountValue: unknown): number | null {
  if (gross === null) return null;
  const value = toNumber(discountValue);
  if (discountType == null || value === null) return gross;
  if (discountType === "PERCENTAGE") return gross * (1 - value / 100);
  return Math.max(0, gross - value);
}

export interface OperationFeeInput {
  amount: unknown;
  feeType: FeeTypeKey | null | undefined;
  feeValue: unknown;
  feeDiscountType: DiscountTypeKey | null | undefined;
  feeDiscountValue: unknown;
}

/** Net mediation fee (gross fee minus its own discount) for an operation. */
export function netFeeAmount(op: OperationFeeInput): number | null {
  const gross = resolveGrossFee({ feeType: op.feeType, feeValue: op.feeValue, operationAmount: op.amount });
  return applyDiscount(gross, op.feeDiscountType, op.feeDiscountValue);
}

export interface OperationRetainerInput {
  monthlyRetainer: unknown;
  retainerDiscountType: DiscountTypeKey | null | undefined;
  retainerDiscountValue: unknown;
}

/** Net monthly retainer (gross retainer minus its own discount) for an operation. */
export function netMonthlyRetainer(op: OperationRetainerInput): number | null {
  const gross = toNumber(op.monthlyRetainer);
  return applyDiscount(gross, op.retainerDiscountType, op.retainerDiscountValue);
}
