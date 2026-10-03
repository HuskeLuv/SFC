-- Análise de Ativos — bloco C (fatia 0: relatar dado incorreto + curadoria). Migration ADITIVA: só
-- CREATE TABLE / CREATE INDEX, idempotente (IF NOT EXISTS). As FKs ficam dentro do CREATE TABLE
-- (mesmos nomes que o Prisma geraria), para não haver ALTER TABLE; por isso a ordem das tabelas
-- importa (analise_casos_dado antes das que apontam para ela). Dev (Neon, com drift): aplicar com
-- scripts/analise-ativos/apply-migration-bloco-c.ts; produção: prisma migrate deploy.

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_casos_dado" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT,
    "classe" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "periodo" TEXT,
    "origem" TEXT NOT NULL,
    "regraCodigo" TEXT,
    "chaveDeteccao" TEXT,
    "chaveAberta" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "resolucao" TEXT,
    "efeitoTela" TEXT,
    "emConferencia" BOOLEAN NOT NULL DEFAULT false,
    "regraAtiva" BOOLEAN NOT NULL DEFAULT false,
    "conferenciaManual" BOOLEAN NOT NULL DEFAULT false,
    "slaAte" DATE,
    "responsavelId" TEXT,
    "notaCurador" TEXT,
    "respostaPublica" VARCHAR(500),
    "contexto" JSONB NOT NULL,
    "nReportes" INTEGER NOT NULL DEFAULT 0,
    "casoAnteriorId" TEXT,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaDeteccaoEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoPorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_casos_dado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "analise_casos_dado_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_data_reports" (
    "id" TEXT NOT NULL,
    "protocolo" VARCHAR(12) NOT NULL,
    "casoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clienteId" TEXT,
    "symbol" TEXT NOT NULL,
    "bloco" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "periodo" VARCHAR(32),
    "valorExibido" VARCHAR(64),
    "valorEsperado" VARCHAR(64),
    "fonteExibida" VARCHAR(160),
    "frescorExibido" VARCHAR(160),
    "versaoQuadro" VARCHAR(40) NOT NULL,
    "mensagem" VARCHAR(1000) NOT NULL,
    "fonteEsperada" VARCHAR(300),
    "contextoServidor" JSONB NOT NULL,
    "respondidoEm" TIMESTAMP(3),
    "anonimizadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analise_data_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "analise_data_reports_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "analise_casos_dado"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "analise_data_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "analise_data_reports_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_casos_eventos" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "autorId" TEXT,
    "tipo" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "texto" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analise_casos_eventos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "analise_casos_eventos_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "analise_casos_dado"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_casos_dado_chaveAberta_key" ON "analise_casos_dado"("chaveAberta");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_casos_dado_status_slaAte_idx" ON "analise_casos_dado"("status", "slaAte");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_casos_dado_symbol_status_idx" ON "analise_casos_dado"("symbol", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_casos_dado_origem_status_idx" ON "analise_casos_dado"("origem", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_casos_dado_regraCodigo_chaveDeteccao_idx" ON "analise_casos_dado"("regraCodigo", "chaveDeteccao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_casos_dado_conferenciaManual_status_idx" ON "analise_casos_dado"("conferenciaManual", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_data_reports_protocolo_key" ON "analise_data_reports"("protocolo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_data_reports_userId_createdAt_idx" ON "analise_data_reports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_data_reports_symbol_createdAt_idx" ON "analise_data_reports"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_data_reports_casoId_idx" ON "analise_data_reports"("casoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_data_reports_createdAt_idx" ON "analise_data_reports"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_casos_eventos_casoId_createdAt_idx" ON "analise_casos_eventos"("casoId", "createdAt");
