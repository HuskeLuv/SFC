-- Override layer do planejamento: campos travados manualmente pelo usuário.
-- Campos auto (ausentes daqui) re-sincronizam do contexto financeiro.
ALTER TABLE "aposentadoria_planos" ADD COLUMN "fieldLocks" JSONB NOT NULL DEFAULT '[]';
