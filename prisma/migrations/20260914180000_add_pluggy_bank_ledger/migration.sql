-- Integração bancária (Pluggy / Open Finance) — Fase 2: ledger + fila de webhooks (set/2026)
CREATE TABLE IF NOT EXISTS "bank_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'pluggy',
    "providerItemId" TEXT NOT NULL,
    "connectorId" INTEGER NOT NULL,
    "connectorName" TEXT NOT NULL,
    "connectorImageUrl" TEXT,
    "isOpenFinance" BOOLEAN NOT NULL DEFAULT false,
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'UPDATING',
    "executionStatus" TEXT,
    "errorMessage" TEXT,
    "consentExpiresAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "lastManualUpdateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_connections_providerItemId_key" ON "bank_connections"("providerItemId");
CREATE INDEX IF NOT EXISTS "bank_connections_userId_idx" ON "bank_connections"("userId");
CREATE INDEX IF NOT EXISTS "bank_connections_status_idx" ON "bank_connections"("status");
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "bank_accounts" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'BRL',
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balanceAt" TIMESTAMP(3),
    "creditLimit" DECIMAL(15,2),
    "creditAvailable" DECIMAL(15,2),
    "creditBrand" TEXT,
    "creditDueDate" TIMESTAMP(3),
    "creditClosingDate" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_providerAccountId_key" ON "bank_accounts"("providerAccountId");
CREATE INDEX IF NOT EXISTS "bank_accounts_userId_idx" ON "bank_accounts"("userId");
CREATE INDEX IF NOT EXISTS "bank_accounts_connectionId_idx" ON "bank_accounts"("connectionId");
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "bank_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerTxId" TEXT NOT NULL,
    "dedupHash" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionRaw" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "currencyCode" TEXT NOT NULL DEFAULT 'BRL',
    "providerCategory" TEXT,
    "providerCategoryId" TEXT,
    "merchantName" TEXT,
    "merchantCnpj" TEXT,
    "paymentMethod" TEXT,
    "counterpartName" TEXT,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "billId" TEXT,
    "ignorada" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_providerTxId_key" ON "bank_transactions"("providerTxId");
CREATE INDEX IF NOT EXISTS "bank_transactions_userId_date_idx" ON "bank_transactions"("userId", "date");
CREATE INDEX IF NOT EXISTS "bank_transactions_accountId_date_idx" ON "bank_transactions"("accountId", "date");
CREATE INDEX IF NOT EXISTS "bank_transactions_accountId_dedupHash_idx" ON "bank_transactions"("accountId", "dedupHash");
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "pluggy_webhook_events" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "providerItemId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "pluggy_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pluggy_webhook_events_status_receivedAt_idx" ON "pluggy_webhook_events"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "pluggy_webhook_events_providerItemId_idx" ON "pluggy_webhook_events"("providerItemId");
