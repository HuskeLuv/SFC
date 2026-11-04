-- Análise de Ativos: Fiagro e FI-Infra listados entram no mapa ticker ↔ CNPJ (fii_ticker_map),
-- com o tipo do fundo segundo a lista da B3 ('FII' | 'FIAGRO' | 'FI-INFRA').
-- Aditiva e idempotente: as linhas existentes ficam 'FII' (o default).
ALTER TABLE "fii_ticker_map" ADD COLUMN IF NOT EXISTS "tipoFundo" TEXT NOT NULL DEFAULT 'FII';

CREATE INDEX IF NOT EXISTS "fii_ticker_map_tipoFundo_idx" ON "fii_ticker_map"("tipoFundo");
