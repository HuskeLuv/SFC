-- Backtest da Análise de Ativos (18/10/2026, achado A1): a chave (symbol, date = pagamento, tipo)
-- obrigava o sync da BRAPI a SOMAR numa linha os proventos pagos no mesmo dia com datas-com
-- diferentes (VIVT3, SAPR11, CMIG4, ISAE4...). A data-com entra na chave; NULLS NOT DISTINCT mantém
-- uma linha só por (symbol, date, tipo) quando a data-com é nula (YAHOO e legado).
-- As linhas atuais já satisfazem a chave nova (é mais fina que a antiga): nenhum dado muda aqui. A
-- limpeza das somas antigas é o script scripts/analise-ativos/limpar-proventos-somados.ts
-- (docs/analise-ativos/backtest-out2026/ATIVACAO.md). Idempotente (IF EXISTS / IF NOT EXISTS).

-- DropIndex
DROP INDEX IF EXISTS "asset_dividend_history_symbol_date_tipo_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "asset_dividend_history_symbol_date_tipo_dataCom_key" ON "asset_dividend_history"("symbol", "date", "tipo", "dataCom") NULLS NOT DISTINCT;
