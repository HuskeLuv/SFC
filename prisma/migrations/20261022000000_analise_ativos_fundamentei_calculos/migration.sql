-- Análise de Ativos — A2+A4+A5+C, alinhar ao Fundamentei (docs/analise-ativos/fundamentei-regras/
-- desenho.json, fatia 0). SQL à mão, idempotente: só ADD COLUMN IF NOT EXISTS de colunas ANULÁVEIS
-- (sem DEFAULT, sem NOT NULL, sem backfill) em tabelas que já existem. Nada é apagado, renomeado ou
-- muda de tipo; nenhuma FK. Colunas nulas são inertes: reverter = deixá-las nulas (DROP só com OK).
-- Dev (Postgres local): npx prisma migrate deploy; produção: prisma migrate deploy (deploy.sh).

-- AlterTable: remuneração em ações (SBC) do 10-K, gravada pela ingestão SEC com ANALISE_ATIVOS_SEC_SBC
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "remuneracaoAcoes" DECIMAL(20,2);

-- AlterTable: FCO ajustado pela SBC por ação e dividendos ÷ FCO ajustado (último FY do REIT)
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "fcoAjustadoPorAcao" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "dividendosFcoAjustadoPct" DOUBLE PRECISION;
