-- Origem da entry de acompanhamento mensal do sonho:
--   "manual" = digitada no modal "Registrar Mês"
--   "auto"   = derivada das células verdes (realizadas) da linha-espelho no
--              fluxo de caixa pelo sync caixa→sonho.
-- Manual tem precedência: o sync nunca sobrescreve/remove entries manuais.
ALTER TABLE "planejamento_objetivo_entries"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
