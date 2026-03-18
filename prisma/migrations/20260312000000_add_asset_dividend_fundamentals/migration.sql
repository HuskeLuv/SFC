-- CreateTable
CREATE TABLE "asset_dividend_history" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "valorUnitario" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BRAPI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_dividend_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_fundamentals" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "priceEarnings" DOUBLE PRECISION,
    "beta" DOUBLE PRECISION,
    "dividendYield" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_fundamentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_dividend_history_symbol_idx" ON "asset_dividend_history"("symbol");

-- CreateIndex
CREATE INDEX "asset_dividend_history_symbol_date_idx" ON "asset_dividend_history"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "asset_dividend_history_symbol_date_tipo_key" ON "asset_dividend_history"("symbol", "date", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "asset_fundamentals_symbol_key" ON "asset_fundamentals"("symbol");
