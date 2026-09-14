-- Integração bancária Fase 2c: transação importada aplicada numa linha do fluxo de caixa
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "cashflowItemId" TEXT;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "bank_transactions_cashflowItemId_idx" ON "bank_transactions"("cashflowItemId");
CREATE INDEX IF NOT EXISTS "bank_transactions_userId_appliedAt_idx" ON "bank_transactions"("userId", "appliedAt");
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_cashflowItemId_fkey" FOREIGN KEY ("cashflowItemId") REFERENCES "CashflowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
