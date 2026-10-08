-- Avisos de sucesso parcial do Pluggy (out/2026): produtos que não vieram na última execução
-- (ex.: limite mensal do Open Finance). Aditiva e idempotente. O status 'DELETED' (conexão
-- desconectada pelo provedor) cabe na coluna "status" existente — sem DDL.
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "avisos" JSONB;
