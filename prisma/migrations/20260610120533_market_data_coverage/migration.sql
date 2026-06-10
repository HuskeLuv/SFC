-- CreateTable
CREATE TABLE "market_data_coverage" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dividendCount" INTEGER NOT NULL DEFAULT 0,
    "caCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "gapRequestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_data_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_data_coverage_symbol_key" ON "market_data_coverage"("symbol");

-- CreateIndex
CREATE INDEX "market_data_coverage_status_idx" ON "market_data_coverage"("status");

-- CreateIndex
CREATE INDEX "market_data_coverage_gapRequestedAt_idx" ON "market_data_coverage"("gapRequestedAt");

-- CreateIndex
CREATE INDEX "market_data_coverage_lastCheckedAt_idx" ON "market_data_coverage"("lastCheckedAt");
