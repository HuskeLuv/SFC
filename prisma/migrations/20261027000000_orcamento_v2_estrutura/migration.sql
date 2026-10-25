-- Orçamento v2 (ticket 86e3v8p3u): orçado por subcategoria (CashflowItem) e mês.
-- Só aditiva e idempotente (pode rodar duas vezes). cashflow_orcamentos NÃO é alterada:
-- a tela atual continua lendo e gravando nela para quem não foi ativado no v2.

-- ADD COLUMN com DEFAULT constante no PG16 só altera metadados (sem reescrever a tabela).
ALTER TABLE "CashflowItem"  ADD COLUMN IF NOT EXISTS "isGeral"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashflowItem"  ADD COLUMN IF NOT EXISTS "orcamentoFixa" BOOLEAN;
ALTER TABLE "CashflowGroup" ADD COLUMN IF NOT EXISTS "icone"         VARCHAR(30);

-- Geral é sempre linha do usuário (nunca template).
DO $$ BEGIN
  ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_geral_do_usuario"
    CHECK ("isGeral" = false OR "userId" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Uma Geral visível por grupo (o grupo da Geral é sempre o grupo do usuário).
-- Também é a trava contra corrida em garantirGerais/ativação (P2002 capturado).
CREATE UNIQUE INDEX IF NOT EXISTS "CashflowItem_geral_por_grupo"
  ON "CashflowItem" ("groupId") WHERE "isGeral" = true AND "hidden" = false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "cashflow_orcamento_itens" (
  "id"        TEXT          NOT NULL,
  "userId"    TEXT          NOT NULL,
  "itemId"    TEXT          NOT NULL,
  "ano"       INTEGER       NOT NULL,
  "mes"       INTEGER       NOT NULL,            -- 0 = jan … 11 = dez (igual CashflowValue)
  "valor"     DECIMAL(15,2),
  "pct"       DECIMAL(5,1),                      -- 1 casa (R-17/R-18)
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "cashflow_orcamento_itens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cashflow_orcamento_itens_xor"  CHECK (("valor" IS NOT NULL) <> ("pct" IS NOT NULL)),
  CONSTRAINT "cashflow_orcamento_itens_valor_ck" CHECK ("valor" IS NULL OR "valor" >= 0),
  CONSTRAINT "cashflow_orcamento_itens_pct_ck"   CHECK ("pct" IS NULL OR ("pct" >= 0 AND "pct" <= 100)),
  CONSTRAINT "cashflow_orcamento_itens_mes_ck"   CHECK ("mes" BETWEEN 0 AND 11)
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "cashflow_orcamento_itens_userId_itemId_ano_mes_key"
  ON "cashflow_orcamento_itens" ("userId", "itemId", "ano", "mes");
CREATE INDEX IF NOT EXISTS "cashflow_orcamento_itens_userId_ano_idx"
  ON "cashflow_orcamento_itens" ("userId", "ano");
CREATE INDEX IF NOT EXISTS "cashflow_orcamento_itens_itemId_idx"
  ON "cashflow_orcamento_itens" ("itemId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "cashflow_orcamento_itens" ADD CONSTRAINT "cashflow_orcamento_itens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NO ACTION (e não CASCADE): apagar um item com orçado sem passar pela fusão na Geral falha
-- alto em vez de perder o orçado em silêncio. A exclusão de conta é anonimização (o User não
-- é apagado), então este FK não atrapalha o fluxo LGPD.
DO $$ BEGIN
  ALTER TABLE "cashflow_orcamento_itens" ADD CONSTRAINT "cashflow_orcamento_itens_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "CashflowItem"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "cashflow_orcamento_prefs" (
  "userId"               TEXT         NOT NULL,
  -- ids de CashflowGroup (do usuário). Sem NOT NULL, como o Prisma gera para String[]
  -- (evita drift no migrate diff); toda escrita passa pelo Prisma, que nunca grava NULL.
  "categoriasRecolhidas" TEXT[]                DEFAULT ARRAY[]::TEXT[],
  "graficoVisivel"       BOOLEAN      NOT NULL DEFAULT true,
  "fonte"                VARCHAR(12)  NOT NULL DEFAULT 'lancado',
  "estruturaCriadaEm"    TIMESTAMP(3),                         -- marca de ativação (idempotência)
  "avisoGeralVistoEm"    TIMESTAMP(3),                         -- aviso de primeira visita
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cashflow_orcamento_prefs_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "cashflow_orcamento_prefs_fonte_ck" CHECK ("fonte" IN ('lancado','consolidado'))
);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "cashflow_orcamento_prefs" ADD CONSTRAINT "cashflow_orcamento_prefs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
