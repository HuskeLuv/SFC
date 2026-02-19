-- AlterTable: Aumentar precisão de price para suportar IBOV (~120k) e outros índices
ALTER TABLE "asset_price_history" ALTER COLUMN "price" SET DATA TYPE DECIMAL(18,6);

-- AlterTable: currentPrice no Asset também pode receber valores de índice
ALTER TABLE "assets" ALTER COLUMN "currentPrice" SET DATA TYPE DECIMAL(18,6);
