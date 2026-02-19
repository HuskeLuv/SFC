-- CreateTable
CREATE TABLE "benchmark_cumulative_returns" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "benchmarkType" TEXT NOT NULL,
    "cumulativeReturn" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_cumulative_returns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_cumulative_returns_benchmarkType_date_key" ON "benchmark_cumulative_returns"("benchmarkType", "date");

-- CreateIndex
CREATE INDEX "benchmark_cumulative_returns_benchmarkType_idx" ON "benchmark_cumulative_returns"("benchmarkType");

-- CreateIndex
CREATE INDEX "benchmark_cumulative_returns_date_idx" ON "benchmark_cumulative_returns"("date");

-- CreateIndex
CREATE INDEX "benchmark_cumulative_returns_benchmarkType_date_idx" ON "benchmark_cumulative_returns"("benchmarkType", "date");
