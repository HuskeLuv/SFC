-- Origem estável das posições/dívidas importadas do banco (evita duplicar ao reconectar).
CREATE TABLE IF NOT EXISTS "pluggy_importacao_origens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "assetId" TEXT,
    "portfolioId" TEXT,
    "fixedIncomeAssetId" TEXT,
    "dividaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pluggy_importacao_origens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pluggy_importacao_origens_userId_chave_key" ON "pluggy_importacao_origens"("userId", "chave");
DO $$ BEGIN
  ALTER TABLE "pluggy_importacao_origens" ADD CONSTRAINT "pluggy_importacao_origens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
