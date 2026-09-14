-- Integração bancária: dedup entre conexões (banco conectado duas vezes)
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "globalHash" TEXT;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "duplicadaDe" TEXT;
CREATE INDEX IF NOT EXISTS "bank_transactions_userId_globalHash_idx" ON "bank_transactions"("userId", "globalHash");
