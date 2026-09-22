-- IP de quem desconectou (revogação pelo usuário).
ALTER TABLE "open_finance_consentimentos" ADD COLUMN IF NOT EXISTS "ipRevogacao" TEXT;
