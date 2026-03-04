-- AlterTable: Portfolio.quantity e StockTransaction.quantity de Int para Float
-- Necessário para suportar quantidades fracionárias de criptomoedas (ex: 0.000001 BTC)

ALTER TABLE "portfolios" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;

ALTER TABLE "stock_transactions" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;
