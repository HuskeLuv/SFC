-- Pesquisa de satisfação no app (CSAT, ClickUp 86e3vmyv7). ADITIVA e idempotente.
-- LGPD: o comentário é texto livre (dado pessoal); apagado na exclusão de conta (DELETE /api/profile).
-- Rollback (não rodar sem OK; apaga as respostas):
--   DROP TABLE IF EXISTS "csat_respostas";

CREATE TABLE IF NOT EXISTS "csat_respostas" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "nota" INTEGER,
  "comentario" TEXT,
  "origem" TEXT NOT NULL DEFAULT 'app',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "csat_respostas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "csat_respostas_userId_createdAt_idx" ON "csat_respostas"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "csat_respostas_createdAt_idx" ON "csat_respostas"("createdAt");

DO $$ BEGIN
  ALTER TABLE "csat_respostas" ADD CONSTRAINT "csat_respostas_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
