-- Origem do registro mensal do acompanhamento da aposentadoria (ClickUp 86e3vxd5r).
-- 'auto'   = preenchido sozinho a partir da carteira (é atualizado enquanto a carteira mudar);
-- 'manual' = digitado pelo cliente (nunca é sobrescrito pelo automático).
-- ADITIVA e idempotente; registros existentes ficam 'manual' (conservador: nada que já existe muda).
-- Rollback (não rodar sem OK; o código antigo ignora a coluna):
--   ALTER TABLE "aposentadoria_plano_entries" DROP COLUMN IF EXISTS "origem";

ALTER TABLE "aposentadoria_plano_entries" ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'manual';
