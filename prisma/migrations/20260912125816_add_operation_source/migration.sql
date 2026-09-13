-- CreateEnum
CREATE TYPE "OperationSource" AS ENUM ('CLIENTE_PROPRIO', 'STUDIO_MARTINELLI', 'STUDIO_GI', 'ALTRO');

-- AlterTable
ALTER TABLE "FinancingOperation" ADD COLUMN     "source" "OperationSource" NOT NULL DEFAULT 'CLIENTE_PROPRIO',
ADD COLUMN     "sourceDetail" TEXT;
