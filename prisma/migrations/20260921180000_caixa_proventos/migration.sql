-- Caixa para Investir (fase 3): proventos pagos entram no caixa livre (opcional).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "caixaProventosDesde" TIMESTAMP(3);
ALTER TABLE "portfolio_proventos" ADD COLUMN IF NOT EXISTS "caixaCreditadoEm" TIMESTAMP(3);
ALTER TABLE "portfolio_proventos" ADD COLUMN IF NOT EXISTS "caixaCreditadoValor" DOUBLE PRECISION;
