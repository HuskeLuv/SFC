-- Análise de Ativos v2.4 — Filtros de Fundamentos (fatia 0: contratos). Migration ADITIVA e
-- idempotente: só CREATE TABLE / CREATE INDEX IF NOT EXISTS e ADD COLUMN IF NOT EXISTS de colunas
-- ANULÁVEIS (sem DEFAULT, sem NOT NULL). Nada é apagado: o banco do score (asset_scores, colunas
-- indice*/semáforo, scoring_params) fica intacto até a etapa D6. Dev (Neon, com drift): aplicar com
-- scripts/analise-ativos/apply-migration-filtros.ts; produção: prisma migrate deploy.

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "criterios" JSONB;

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "perfilCriterios" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "criteria_params" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "criteria_params_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "criteria_eval" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "janela" INTEGER NOT NULL,
    "anoInicio" INTEGER NOT NULL,
    "anoFim" INTEGER NOT NULL,
    "atendidos" INTEGER NOT NULL,
    "aplicaveis" INTEGER NOT NULL,
    "semDado" BOOLEAN NOT NULL,
    "resultados" JSONB NOT NULL,
    "paramsVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criteria_eval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "criteria_params_version_key" ON "criteria_params"("version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "criteria_params_validFrom_idx" ON "criteria_params"("validFrom");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "criteria_eval_classe_janela_idx" ON "criteria_eval"("classe", "janela");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "criteria_eval_symbol_janela_key" ON "criteria_eval"("symbol", "janela");
