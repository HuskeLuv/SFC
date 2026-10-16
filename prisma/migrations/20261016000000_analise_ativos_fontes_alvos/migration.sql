-- Análise de Ativos v2.5 — regras como a spec do Pedro + camada de fontes + alvo por ativo (fatia 0:
-- contratos). Gerada com `prisma migrate diff` (schema da main → schema da v2.5) e só depois tornada
-- idempotente: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS de colunas ANULÁVEIS (sem
-- DEFAULT, sem NOT NULL) e FK em DO $$ … EXCEPTION. Nada é apagado, renomeado ou muda de tipo.
-- Dev (Neon, com drift): scripts/analise-ativos/apply-migration-fontes-alvos.ts; produção: prisma
-- migrate deploy (deploy.sh).

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;

-- AlterTable
ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;

-- AlterTable
ALTER TABLE "fii_quarterly" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "asset_fundamentals_serie" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "emissorId" TEXT,
    "classe" TEXT NOT NULL,
    "mercado" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "tipoPeriodo" TEXT NOT NULL,
    "anoFiscal" INTEGER NOT NULL,
    "dtFim" DATE NOT NULL,
    "valor" DECIMAL(24,6),
    "unidade" TEXT NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "fonte" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceRef" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "versao" INTEGER NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "motivosRevisao" TEXT[],
    "incompleto" BOOLEAN NOT NULL DEFAULT false,
    "extractedBy" TEXT NOT NULL,
    "confianca" DOUBLE PRECISION,
    "sourcePdfUrl" TEXT,
    "sourcePage" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_fundamentals_serie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fii_property_quality" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "periodo" DATE NOT NULL,
    "padAaaPct" DOUBLE PRECISION,
    "padAaPct" DOUBLE PRECISION,
    "padAPct" DOUBLE PRECISION,
    "tenantsCount" INTEGER,
    "topTenantPct" DOUBLE PRECISION,
    "atypicalPct" DOUBLE PRECISION,
    "avgLeaseYears" DOUBLE PRECISION,
    "criCount" INTEGER,
    "indexMix" JSONB,
    "avgRate" DOUBLE PRECISION,
    "ltvAvg" DOUBLE PRECISION,
    "defaultPct" DOUBLE PRECISION,
    "highYieldPct" DOUBLE PRECISION,
    "durationYears" DOUBLE PRECISION,
    "sourcePdfUrl" TEXT,
    "sourcePage" JSONB,
    "extractedBy" TEXT NOT NULL,
    "confianca" JSONB,
    "reviewStatus" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "versao" INTEGER NOT NULL,
    "incompleto" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fii_property_quality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "planning_asset_targets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "targetPct" DECIMAL(6,3) NOT NULL,
    "atualizadoPorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_asset_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_fundamentals_serie_serie_symbol_dtFim_idx" ON "asset_fundamentals_serie"("serie", "symbol", "dtFim");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_fundamentals_serie_fonte_fetchedAt_idx" ON "asset_fundamentals_serie"("fonte", "fetchedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_fundamentals_serie_reviewStatus_idx" ON "asset_fundamentals_serie"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "asset_fundamentals_serie_symbol_serie_tipoPeriodo_dtFim_fon_key" ON "asset_fundamentals_serie"("symbol", "serie", "tipoPeriodo", "dtFim", "fonte", "versao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fii_property_quality_symbol_periodo_idx" ON "fii_property_quality"("symbol", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fii_property_quality_cnpj_periodo_fonte_versao_key" ON "fii_property_quality"("cnpj", "periodo", "fonte", "versao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "planning_asset_targets_userId_idx" ON "planning_asset_targets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "planning_asset_targets_userId_assetId_key" ON "planning_asset_targets"("userId", "assetId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "planning_asset_targets" ADD CONSTRAINT "planning_asset_targets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "planning_asset_targets" ADD CONSTRAINT "planning_asset_targets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

