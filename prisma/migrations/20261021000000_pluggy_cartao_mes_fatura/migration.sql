-- Cartão no mês da fatura (ticket 86e3tjtep, 20/10/2026). Só aditiva e idempotente:
-- colunas anuláveis em bank_transactions e tabela nova bank_credit_bills.

-- AlterTable
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "competenciaAno" INTEGER;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "competenciaMes" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "bank_credit_bills" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerBillId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "closingDate" TIMESTAMP(3),
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_credit_bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bank_credit_bills_providerBillId_key" ON "bank_credit_bills"("providerBillId");
CREATE INDEX IF NOT EXISTS "bank_credit_bills_accountId_dueDate_idx" ON "bank_credit_bills"("accountId", "dueDate");
CREATE INDEX IF NOT EXISTS "bank_credit_bills_userId_idx" ON "bank_credit_bills"("userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "bank_credit_bills" ADD CONSTRAINT "bank_credit_bills_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
