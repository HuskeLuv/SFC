-- CreateTable
CREATE TABLE "market_indicator_cache" (
    "id" TEXT NOT NULL,
    "indicatorKey" TEXT NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "changePercent" DECIMAL(10,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_indicator_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_indicator_cache_indicatorKey_key" ON "market_indicator_cache"("indicatorKey");
