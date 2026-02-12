-- CreateTable
CREATE TABLE "asset_price_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(10,6) NOT NULL,
    "currency" TEXT,
    "source" TEXT NOT NULL DEFAULT 'BRAPI',
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_price_logs" (
    "id" TEXT NOT NULL,
    "totalUpdated" INTEGER NOT NULL DEFAULT 0,
    "totalInserted" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_price_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "currentPrice" DECIMAL(10,6);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "priceUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "asset_price_history_symbol_date_key" ON "asset_price_history"("symbol", "date");

-- CreateIndex
CREATE INDEX "asset_price_history_symbol_date_idx" ON "asset_price_history"("symbol", "date");

-- CreateIndex
CREATE INDEX "asset_price_history_symbol_idx" ON "asset_price_history"("symbol");

-- CreateIndex
CREATE INDEX "asset_price_history_date_idx" ON "asset_price_history"("date");

-- CreateIndex
CREATE INDEX "sync_price_logs_executedAt_idx" ON "sync_price_logs"("executedAt");

-- AddForeignKey
ALTER TABLE "asset_price_history" ADD CONSTRAINT "asset_price_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
