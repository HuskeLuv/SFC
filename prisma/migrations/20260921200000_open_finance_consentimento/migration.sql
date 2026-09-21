-- Registro do consentimento Open Finance dado no My Finance (adequação jurídica).
CREATE TABLE IF NOT EXISTS "open_finance_consentimentos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versaoTexto" TEXT NOT NULL,
    "hashTexto" TEXT NOT NULL,
    "produtos" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "reconexao" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT,
    "providerItemId" TEXT,
    "connectorName" TEXT,
    "vinculadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "motivoRevogacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "open_finance_consentimentos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "open_finance_consentimentos_userId_idx" ON "open_finance_consentimentos"("userId");
CREATE INDEX IF NOT EXISTS "open_finance_consentimentos_connectionId_idx" ON "open_finance_consentimentos"("connectionId");
DO $$ BEGIN
  ALTER TABLE "open_finance_consentimentos" ADD CONSTRAINT "open_finance_consentimentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
