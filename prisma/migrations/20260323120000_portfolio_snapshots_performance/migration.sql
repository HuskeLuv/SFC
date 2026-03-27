-- CreateTable
CREATE TABLE "portfolio_daily_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalValue" DECIMAL(18,4) NOT NULL,
    "totalInvested" DECIMAL(18,4) NOT NULL,
    "totalEarnings" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_performance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dailyReturn" DECIMAL(14,8),
    "cumulativeReturn" DECIMAL(14,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_performance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_daily_snapshots_userId_date_idx" ON "portfolio_daily_snapshots"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_daily_snapshots_userId_date_key" ON "portfolio_daily_snapshots"("userId", "date");

-- CreateIndex
CREATE INDEX "portfolio_performance_userId_date_idx" ON "portfolio_performance"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_performance_userId_date_key" ON "portfolio_performance"("userId", "date");

-- CreateIndex
CREATE INDEX "stock_transactions_userId_date_idx" ON "stock_transactions"("userId", "date");

-- CreateIndex
CREATE INDEX "portfolios_userId_assetId_idx" ON "portfolios"("userId", "assetId");

-- CreateIndex
CREATE INDEX "portfolios_userId_stockId_idx" ON "portfolios"("userId", "stockId");

-- AddForeignKey
ALTER TABLE "portfolio_daily_snapshots" ADD CONSTRAINT "portfolio_daily_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_performance" ADD CONSTRAINT "portfolio_performance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
