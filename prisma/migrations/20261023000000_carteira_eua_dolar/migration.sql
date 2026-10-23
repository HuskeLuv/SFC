-- Carteira EUA em US$ (out/2026): unidade da posição e custo em R$.
-- Opcionais, sem DEFAULT, sem backfill, sem índice: vazias são inertes. Reverter = deixar vazias.
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "moedaRegistro" TEXT;
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "totalInvestedBrl" DOUBLE PRECISION;
