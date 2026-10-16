-- Análise de Ativos — bloco 1 (fatia 0: Salvos, filtros salvos, comparações e avisos das listas).
-- Migration ADITIVA e idempotente: só CREATE TABLE / CREATE INDEX IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS com DEFAULT e as FKs em blocos DO $$ … EXCEPTION (duplicate_object). Sem índice parcial
-- (evita drift no Prisma). FK para "User" (o model User não tem @@map). NÃO confundir com o
-- Watchlist da Carteira (tabela watchlists): aqui é tudo analise_*.

-- AlterTable: categoria de push 'analise' (sem registro = ligado)
ALTER TABLE "push_preferencias" ADD COLUMN IF NOT EXISTS "analise" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_listas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "alertaResultado" BOOLEAN NOT NULL DEFAULT true,
    "alertaProvento" BOOLEAN NOT NULL DEFAULT true,
    "alertaCriterios" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_listas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_lista_itens" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analise_lista_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_filtros_salvos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "estado" JSONB NOT NULL,
    "versaoSchema" INTEGER NOT NULL DEFAULT 1,
    "ultimoUsoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_filtros_salvos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_comparacoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "tickers" TEXT[],
    "janela" INTEGER NOT NULL DEFAULT 5,
    "tipoFii" TEXT,
    "chave" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_comparacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_alerta_envios" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analise_alerta_envios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_alerta_marcos" (
    "symbol" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "marco" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_alerta_marcos_pkey" PRIMARY KEY ("symbol","tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_listas_userId_nomeNormalizado_key" ON "analise_listas"("userId", "nomeNormalizado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_listas_userId_createdAt_idx" ON "analise_listas"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_lista_itens_listaId_symbol_key" ON "analise_lista_itens"("listaId", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_lista_itens_userId_symbol_idx" ON "analise_lista_itens"("userId", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_lista_itens_symbol_idx" ON "analise_lista_itens"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_filtros_salvos_userId_classe_nomeNormalizado_key" ON "analise_filtros_salvos"("userId", "classe", "nomeNormalizado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_filtros_salvos_userId_classe_idx" ON "analise_filtros_salvos"("userId", "classe");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_comparacoes_userId_chave_key" ON "analise_comparacoes"("userId", "chave");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_comparacoes_userId_updatedAt_idx" ON "analise_comparacoes"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_alerta_envios_userId_tipo_chave_key" ON "analise_alerta_envios"("userId", "tipo", "chave");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_alerta_envios_userId_createdAt_idx" ON "analise_alerta_envios"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_alerta_envios_createdAt_idx" ON "analise_alerta_envios"("createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analise_listas" ADD CONSTRAINT "analise_listas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analise_lista_itens" ADD CONSTRAINT "analise_lista_itens_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "analise_listas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analise_lista_itens" ADD CONSTRAINT "analise_lista_itens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analise_filtros_salvos" ADD CONSTRAINT "analise_filtros_salvos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analise_comparacoes" ADD CONSTRAINT "analise_comparacoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analise_alerta_envios" ADD CONSTRAINT "analise_alerta_envios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
