-- Análise de Ativos — bloco D (fatia 0: "Meus cenários"). Migration ADITIVA e idempotente: só
-- CREATE TABLE / CREATE INDEX IF NOT EXISTS e a FK num bloco DO $$ … EXCEPTION (duplicate_object),
-- que não falha se a constraint já existir. FK para "User" (o model User não tem @@map). Nenhuma
-- outra tabela muda. Dev (Neon, com drift): aplicar com
-- scripts/analise-ativos/apply-migration-bloco-d.ts; produção: prisma migrate deploy.

-- CreateTable
CREATE TABLE IF NOT EXISTS "analise_cenarios" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "premissas" JSONB NOT NULL,
    "dadosEditados" JSONB,
    "versaoSchema" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analise_cenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "analise_cenarios_userId_symbol_key" ON "analise_cenarios"("userId", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analise_cenarios_userId_updatedAt_idx" ON "analise_cenarios"("userId", "updatedAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "analise_cenarios" ADD CONSTRAINT "analise_cenarios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
