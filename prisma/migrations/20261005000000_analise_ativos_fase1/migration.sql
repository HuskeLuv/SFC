-- Análise de Ativos — Fase 1 (fatia 0a). Migration ADITIVA: só CREATE TABLE / CREATE INDEX,
-- idempotente (IF NOT EXISTS). As FKs para "User" ficam dentro do CREATE TABLE (mesmos nomes que o
-- Prisma geraria), para não haver ALTER TABLE. Dev (Neon, com drift): aplicar com
-- scripts/analise-ativos/apply-migration-fase1.ts; produção: prisma migrate deploy.

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_quadro_linhas" (
    "symbol" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "dataRef" DATE NOT NULL,
    "noQuadro" BOOLEAN NOT NULL,
    "foraDoQuadroMotivo" TEXT,
    "temScore" BOOLEAN NOT NULL,
    "estadoIndice" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeCurto" TEXT,
    "setor" TEXT,
    "subsetor" TEXT,
    "segmento" TEXT,
    "segmentoListagem" TEXT,
    "fiiTipo" TEXT,
    "segmentoCvm" TEXT,
    "regua" TEXT,
    "tickerReferencia" TEXT,
    "preco" DECIMAL(18,6),
    "precoData" DATE,
    "variacaoDiaPct" DOUBLE PRECISION,
    "volumeMedio21" DECIMAL(20,2),
    "baixaLiquidez" BOOLEAN NOT NULL DEFAULT false,
    "valorMercado" DECIMAL(22,2),
    "patrimonio" DECIMAL(20,2),
    "indiceMf" DOUBLE PRECISION,
    "criteriosAtendidos" INTEGER,
    "criteriosAplicaveis" INTEGER,
    "statusCriterios" TEXT[],
    "motivosIncompleto" TEXT[],
    "componentesZeroRegra" TEXT[],
    "anosLucroConsecutivos" INTEGER,
    "mesesComRendimento" INTEGER,
    "anosDividendo" INTEGER,
    "roePct" DOUBLE PRECISION,
    "pl" DOUBLE PRECISION,
    "pvp" DOUBLE PRECISION,
    "dy12mPct" DOUBLE PRECISION,
    "margemLiquidaPct" DOUBLE PRECISION,
    "divLiqEbitda" DOUBLE PRECISION,
    "divLiqPl" DOUBLE PRECISION,
    "payoutPct" DOUBLE PRECISION,
    "vacanciaFisicaCvmPct" DOUBLE PRECISION,
    "nImoveisCvm" INTEGER,
    "nCri" INTEGER,
    "obrigacoesPlPct" DOUBLE PRECISION,
    "cotistas" INTEGER,
    "naoSeAplica" TEXT[],
    "serie10a" JSONB NOT NULL,
    "serieUlt12m" DOUBLE PRECISION,
    "pares" TEXT[],
    "assetId" TEXT,
    "flags" TEXT[],
    "paramsVersion" INTEGER,
    "geradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_quadro_linhas_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_teses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "visibilidade" TEXT NOT NULL DEFAULT 'privada',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_teses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "analise_teses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "feature_beta_users" (
    "id" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adicionadoPor" TEXT NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_beta_users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feature_beta_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_quadro_linhas_classe_noQuadro_idx" ON "analise_quadro_linhas"("classe", "noQuadro");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_quadro_linhas_geradoEm_idx" ON "analise_quadro_linhas"("geradoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_teses_userId_updatedAt_idx" ON "analise_teses"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_teses_userId_symbol_key" ON "analise_teses"("userId", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "feature_beta_users_userId_idx" ON "feature_beta_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "feature_beta_users_recurso_userId_key" ON "feature_beta_users"("recurso", "userId");
