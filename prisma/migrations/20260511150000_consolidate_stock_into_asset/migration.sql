-- Consolidação Stock → Asset (Sprint 4 / bug #16):
--
-- A tabela `stocks` é redundante com `assets`: cobria só ações/FIIs B3, era
-- populada por seed manual, e não recebia o cron BRAPI (que já atualiza
-- `assets`). Esta migration:
--   1. Cria uma row em `assets` pra cada `stocks` sem correspondente por symbol.
--   2. Re-vincula `portfolios`, `stock_transactions` e `watchlists` que apontavam
--      pra stocks via `stockId` para apontarem via `assetId`.
--   3. NÃO remove a tabela `stocks` ainda — drop é em migration separada depois
--      que o código pare de ler stocks (Sprint 4 — etapa final).
--
-- Idempotente: rodar duas vezes não duplica nada (NOT EXISTS / IS NULL guards).
-- Reversível: stocks ainda existe; basta zerar os assetId migrados.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Backfill de assets a partir de stocks
-- ───────────────────────────────────────────────────────────────────────────
-- Heurística de tipo:
--   - ticker terminando em '11' OU companyName contém 'fii'/'fundo imobiliário' → 'fii'
--   - caso contrário → 'stock'
--
-- source='manual' marca a origem legacy. O cron BRAPI sobrescreve pra 'brapi'
-- no próximo run quando o ticker for encontrado.
INSERT INTO "assets" ("id", "symbol", "name", "type", "currency", "source", "updatedAt")
SELECT
  gen_random_uuid()::text,
  s."ticker",
  s."companyName",
  CASE
    WHEN s."ticker" LIKE '%11'
      OR LOWER(s."companyName") LIKE '%fii%'
      OR LOWER(s."companyName") LIKE '%fundo imobili%'
    THEN 'fii'
    ELSE 'stock'
  END,
  'BRL',
  'manual',
  NOW()
FROM "stocks" s
WHERE NOT EXISTS (
  SELECT 1 FROM "assets" a WHERE a."symbol" = s."ticker"
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Re-link portfolios.stockId → portfolios.assetId
-- ───────────────────────────────────────────────────────────────────────────
-- Só toca rows que têm stockId E ainda não têm assetId (preserva linhas já
-- migradas). Garante que o asset destino exista — depois do INSERT acima isso
-- está garantido pra todo stock referenciado.
UPDATE "portfolios" p
SET "assetId" = (
  SELECT a."id" FROM "assets" a
  INNER JOIN "stocks" s ON s."ticker" = a."symbol"
  WHERE s."id" = p."stockId"
  LIMIT 1
)
WHERE p."stockId" IS NOT NULL
  AND p."assetId" IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Re-link stock_transactions.stockId → assetId
-- ───────────────────────────────────────────────────────────────────────────
UPDATE "stock_transactions" t
SET "assetId" = (
  SELECT a."id" FROM "assets" a
  INNER JOIN "stocks" s ON s."ticker" = a."symbol"
  WHERE s."id" = t."stockId"
  LIMIT 1
)
WHERE t."stockId" IS NOT NULL
  AND t."assetId" IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Re-link watchlists.stockId → assetId
-- ───────────────────────────────────────────────────────────────────────────
UPDATE "watchlists" w
SET "assetId" = (
  SELECT a."id" FROM "assets" a
  INNER JOIN "stocks" s ON s."ticker" = a."symbol"
  WHERE s."id" = w."stockId"
  LIMIT 1
)
WHERE w."stockId" IS NOT NULL
  AND w."assetId" IS NULL;
