-- Escolher o destino na importação Open Finance (out/2026, docs/pluggy-importar-destino/).
-- "O usuário confirmou onde o investimento importado fica na Carteira, ou não há o que escolher."
-- null + importStatus 'importado' + posição existente + revisável = "para conferir".
-- Aditiva e idempotente: sem índice novo ([userId, importStatus] já existe).
ALTER TABLE "bank_investments" ADD COLUMN IF NOT EXISTS "destinoConfirmadoEm" TIMESTAMP(3);

-- Backfill (decisão 8): tudo o que já foi importado ou vinculado conta como conferido — a fila
-- começa vazia em produção. Só os que chegarem depois desta migration podem ficar para conferir.
UPDATE "bank_investments"
SET "destinoConfirmadoEm" = COALESCE("importedAt", "updatedAt")
WHERE "importStatus" IN ('importado', 'vinculado')
  AND "destinoConfirmadoEm" IS NULL;
