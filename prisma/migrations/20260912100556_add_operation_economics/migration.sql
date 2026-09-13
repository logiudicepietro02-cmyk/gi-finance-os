-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable
ALTER TABLE "FinancingOperation" ADD COLUMN     "feeDiscountType" "DiscountType",
ADD COLUMN     "feeDiscountValue" DECIMAL(18,4),
ADD COLUMN     "feeType" "FeeType",
ADD COLUMN     "feeValue" DECIMAL(18,4),
ADD COLUMN     "monthlyRetainer" DECIMAL(18,2),
ADD COLUMN     "retainerActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retainerDiscountType" "DiscountType",
ADD COLUMN     "retainerDiscountValue" DECIMAL(18,4),
ADD COLUMN     "retainerEndDate" TIMESTAMP(3),
ADD COLUMN     "retainerStartDate" TIMESTAMP(3);
