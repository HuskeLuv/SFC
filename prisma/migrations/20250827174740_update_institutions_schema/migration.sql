/*
  Warnings:

  - The `status` column on the `institutions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('ATIVA', 'INATIVA');

-- AlterTable
ALTER TABLE "institutions" ALTER COLUMN "cnpj" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "InstitutionStatus" NOT NULL DEFAULT 'ATIVA';

-- CreateIndex
CREATE INDEX "institutions_status_idx" ON "institutions"("status");
