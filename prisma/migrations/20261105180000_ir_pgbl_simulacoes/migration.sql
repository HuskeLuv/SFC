-- Simulação da aba PGBL do IR salva no servidor (ticket 86e2xnyrg, 05/11/2026).
-- Migration ADITIVA e idempotente: tabela nova, nada existente muda.
CREATE TABLE IF NOT EXISTS "ir_pgbl_simulacoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "campos" JSONB NOT NULL DEFAULT '{}',
    "planos" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ir_pgbl_simulacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ir_pgbl_simulacoes_userId_ano_key" ON "ir_pgbl_simulacoes"("userId", "ano");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ir_pgbl_simulacoes_userId_fkey') THEN
    ALTER TABLE "ir_pgbl_simulacoes" ADD CONSTRAINT "ir_pgbl_simulacoes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
