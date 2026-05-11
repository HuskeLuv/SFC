-- Bug #01: validar elegibilidade ao provento pela data-com (ex-date), não pela data de pagamento.
-- AssetDividendHistory.date manteve significado de paymentDate; adicionamos dataCom separado.
ALTER TABLE "asset_dividend_history"
  ADD COLUMN "dataCom" TIMESTAMP(3);

CREATE INDEX "asset_dividend_history_symbol_dataCom_idx"
  ON "asset_dividend_history"("symbol", "dataCom");
