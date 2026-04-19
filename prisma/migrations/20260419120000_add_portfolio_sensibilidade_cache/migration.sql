-- CreateTable
CREATE TABLE "portfolio_sensibilidade_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowMonths" INTEGER NOT NULL,
    "portfolioHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_sensibilidade_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_sensibilidade_cache_userId_idx" ON "portfolio_sensibilidade_cache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_sensibilidade_cache_userId_windowMonths_key" ON "portfolio_sensibilidade_cache"("userId", "windowMonths");

-- AddForeignKey
ALTER TABLE "portfolio_sensibilidade_cache" ADD CONSTRAINT "portfolio_sensibilidade_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
