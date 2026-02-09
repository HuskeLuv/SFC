-- CreateEnum
CREATE TYPE "FixedIncomeType" AS ENUM (
  'CDB_PRE',
  'LC_PRE',
  'LCI_PRE',
  'LCA_PRE',
  'RDB_PRE',
  'LF_PRE',
  'LFS_PRE',
  'CRI_PRE',
  'CRA_PRE',
  'DPGE_PRE',
  'RDC_PRE',
  'LIG_PRE'
);

-- CreateEnum
CREATE TYPE "FixedIncomeIndexer" AS ENUM ('PRE', 'CDI', 'IPCA');

-- CreateEnum
CREATE TYPE "FixedIncomeLiquidity" AS ENUM ('DAILY', 'MATURITY');

-- CreateTable
CREATE TABLE "fixed_income_assets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "type" "FixedIncomeType" NOT NULL,
  "description" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "maturityDate" TIMESTAMP(3) NOT NULL,
  "investedAmount" DOUBLE PRECISION NOT NULL,
  "annualRate" DOUBLE PRECISION NOT NULL,
  "indexer" "FixedIncomeIndexer",
  "indexerPercent" DOUBLE PRECISION,
  "liquidityType" "FixedIncomeLiquidity",
  "taxExempt" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fixed_income_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fixed_income_assets_assetId_key" ON "fixed_income_assets"("assetId");

-- CreateIndex
CREATE INDEX "fixed_income_assets_userId_idx" ON "fixed_income_assets"("userId");

-- CreateIndex
CREATE INDEX "fixed_income_assets_assetId_idx" ON "fixed_income_assets"("assetId");

-- AddForeignKey
ALTER TABLE "fixed_income_assets" ADD CONSTRAINT "fixed_income_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_income_assets" ADD CONSTRAINT "fixed_income_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
