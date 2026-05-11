-- Sprint 5 final (consolidação Stock → Asset, bug #16):
--
-- A migração 20260511150000_consolidate_stock_into_asset re-vinculou todas
-- as FKs (portfolios/stock_transactions/watchlists.stockId → assetId) e
-- garantiu que `assets` contém uma row pra cada `stocks`. Após o deploy da
-- Sprint 5A-D (refactor dos consumers), o código não lê mais `stockId` em
-- lugar nenhum.
--
-- Esta migration:
--   1. Dropa o índice e a FK em `portfolios.stockId` / `stock_transactions.stockId` / `watchlists.stockId`.
--   2. Remove a coluna `stockId` das três tabelas.
--   3. Dropa a tabela `stocks` em si.
--
-- ❗ Irreversível em produção: rollback exigiria restaurar `stocks` a partir
-- de backup e re-popular as colunas `stockId`. Mas como `stocks` já estava
-- 100% representado em `assets`, o backup do `assets` é suficiente.

-- ─── 1. Portfolio ───
ALTER TABLE "portfolios" DROP CONSTRAINT IF EXISTS "portfolios_stockId_fkey";
DROP INDEX IF EXISTS "portfolios_userId_stockId_key";
DROP INDEX IF EXISTS "portfolios_userId_stockId_idx";
ALTER TABLE "portfolios" DROP COLUMN IF EXISTS "stockId";

-- ─── 2. StockTransaction ───
ALTER TABLE "stock_transactions" DROP CONSTRAINT IF EXISTS "stock_transactions_stockId_fkey";
ALTER TABLE "stock_transactions" DROP COLUMN IF EXISTS "stockId";

-- ─── 3. Watchlist ───
ALTER TABLE "watchlists" DROP CONSTRAINT IF EXISTS "watchlists_stockId_fkey";
DROP INDEX IF EXISTS "watchlists_userId_stockId_key";
ALTER TABLE "watchlists" DROP COLUMN IF EXISTS "stockId";

-- ─── 4. Tabela `stocks` em si ───
DROP TABLE IF EXISTS "stocks";
