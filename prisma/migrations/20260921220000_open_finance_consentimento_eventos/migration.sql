-- Linha do tempo da etapa Pluggy/instituição no registro do consentimento.
ALTER TABLE "open_finance_consentimentos" ADD COLUMN IF NOT EXISTS "eventos" JSONB NOT NULL DEFAULT '[]';
