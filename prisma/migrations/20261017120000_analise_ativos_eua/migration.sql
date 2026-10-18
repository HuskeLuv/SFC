-- Análise de Ativos — Stocks e REITs (EUA, fatia 0: contratos). Gerada com `prisma migrate diff`
-- (schema da main → schema da fatia 0) e só depois tornada idempotente: CREATE TABLE/INDEX IF NOT
-- EXISTS e ADD COLUMN IF NOT EXISTS de colunas ANULÁVEIS (sem DEFAULT, sem NOT NULL). Nada é
-- apagado, renomeado ou muda de tipo; nenhuma FK (cadastro SEC sem vínculo com Asset).
-- Dev (Postgres local): npx prisma migrate deploy, ou scripts/analise-ativos/apply-migration-eua.ts;
-- produção: prisma migrate deploy (deploy.sh).

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "acoesMediaDiluida" DECIMAL(20,0);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "dpa" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "dpaOrigem" TEXT;

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "recompras" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "moeda" TEXT;

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "bolsa" TEXT;

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "dpa" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "fcoPorAcao" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "dividendosFcoPct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "sec_companies" (
    "cik" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sic" INTEGER,
    "sicDescricao" TEXT,
    "exercicioFimMmdd" TEXT,
    "bolsa" TEXT,
    "publicFloatUsd" DECIMAL(22,2),
    "publicFloatData" DATE,
    "floatSanidade" TEXT,
    "classe" TEXT,
    "ehReit" BOOLEAN NOT NULL DEFAULT false,
    "reitTipo" TEXT,
    "segmento" TEXT,
    "ehFinanceira" BOOLEAN NOT NULL DEFAULT false,
    "noUniverso" BOOLEAN NOT NULL DEFAULT false,
    "foraMotivo" TEXT,
    "cikHistorico" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'regra',
    "ultimo10k" TEXT,
    "ultimo10kEm" DATE,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sec_companies_pkey" PRIMARY KEY ("cik")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sec_company_tickers" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "symbolNorm" TEXT NOT NULL,
    "cik" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sec_company_tickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "asset_quotes_daily_us" (
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "close" DECIMAL(18,6) NOT NULL,
    "adjClose" DECIMAL(18,6),
    "volume" BIGINT,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_quotes_daily_us_pkey" PRIMARY KEY ("symbol","date")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sec_companies_classe_noUniverso_idx" ON "sec_companies"("classe", "noUniverso");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sec_company_tickers_cik_idx" ON "sec_company_tickers"("cik");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sec_company_tickers_symbolNorm_idx" ON "sec_company_tickers"("symbolNorm");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sec_company_tickers_symbol_validFrom_key" ON "sec_company_tickers"("symbol", "validFrom");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_quotes_daily_us_date_idx" ON "asset_quotes_daily_us"("date");
