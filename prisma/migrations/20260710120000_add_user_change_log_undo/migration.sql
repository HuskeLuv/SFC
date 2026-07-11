-- Undo no histórico de alterações: snapshot pré-mutação (allowlisted) para
-- recriar entidades excluídas, e marcação de entradas desfeitas.
ALTER TABLE "user_change_logs"
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "undoneAt" TIMESTAMP(3),
  ADD COLUMN "undoneById" TEXT,
  ADD COLUMN "revertsId" TEXT;

-- Conflito LIFO por entidade: localizar a entrada mais recente de um entityId.
CREATE INDEX "user_change_logs_userId_entityId_createdAt_idx"
  ON "user_change_logs"("userId", "entityId", "createdAt");
