-- Comentário do usuário na transação do banco antes de lançar (Caixa de entrada, 05/11/2026).
-- Migration ADITIVA e idempotente: só ADD COLUMN IF NOT EXISTS, coluna opcional.
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "nota" TEXT;
