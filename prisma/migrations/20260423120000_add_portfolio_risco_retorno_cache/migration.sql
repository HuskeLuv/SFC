-- CreateTable
CREATE TABLE "portfolio_risco_retorno_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_risco_retorno_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_risco_retorno_cache_userId_key" ON "portfolio_risco_retorno_cache"("userId");

-- AddForeignKey
ALTER TABLE "portfolio_risco_retorno_cache" ADD CONSTRAINT "portfolio_risco_retorno_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
