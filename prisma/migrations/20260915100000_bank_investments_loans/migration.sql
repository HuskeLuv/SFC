-- Integração bancária Fase 3: espelho de investimentos e empréstimos do provedor
CREATE TABLE IF NOT EXISTS "bank_investments" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerInvestmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isin" TEXT,
    "number" TEXT,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION,
    "unitValue" DOUBLE PRECISION,
    "amountOriginal" DECIMAL(15,2),
    "amountProfit" DECIMAL(15,2),
    "rate" DOUBLE PRECISION,
    "rateType" TEXT,
    "fixedAnnualRate" DOUBLE PRECISION,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "issuer" TEXT,
    "status" TEXT,
    "providerDate" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "assetId" TEXT,
    "portfolioId" TEXT,
    "fixedIncomeAssetId" TEXT,
    "importStatus" TEXT NOT NULL DEFAULT 'pendente',
    "importError" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_investments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_investments_providerInvestmentId_key" ON "bank_investments"("providerInvestmentId");
CREATE INDEX IF NOT EXISTS "bank_investments_userId_idx" ON "bank_investments"("userId");
CREATE INDEX IF NOT EXISTS "bank_investments_connectionId_idx" ON "bank_investments"("connectionId");
CREATE INDEX IF NOT EXISTS "bank_investments_userId_importStatus_idx" ON "bank_investments"("userId", "importStatus");
ALTER TABLE "bank_investments" ADD CONSTRAINT "bank_investments_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_investments" ADD CONSTRAINT "bank_investments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "bank_loans" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerLoanId" TEXT NOT NULL,
    "contractNumber" TEXT,
    "productName" TEXT NOT NULL,
    "type" TEXT,
    "contractAmount" DECIMAL(15,2),
    "outstanding" DECIMAL(15,2),
    "nextInstallmentAmount" DECIMAL(15,2),
    "cet" DOUBLE PRECISION,
    "annualRate" DOUBLE PRECISION,
    "indexer" TEXT,
    "amortization" TEXT,
    "periodicity" TEXT,
    "totalInstallments" INTEGER,
    "paidInstallments" INTEGER,
    "dueInstallments" INTEGER,
    "pastDueInstallments" INTEGER,
    "contractDate" TIMESTAMP(3),
    "firstInstallmentDueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dividaId" TEXT,
    "importStatus" TEXT NOT NULL DEFAULT 'pendente',
    "importError" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_loans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_loans_providerLoanId_key" ON "bank_loans"("providerLoanId");
CREATE INDEX IF NOT EXISTS "bank_loans_userId_idx" ON "bank_loans"("userId");
CREATE INDEX IF NOT EXISTS "bank_loans_connectionId_idx" ON "bank_loans"("connectionId");
ALTER TABLE "bank_loans" ADD CONSTRAINT "bank_loans_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_loans" ADD CONSTRAINT "bank_loans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
