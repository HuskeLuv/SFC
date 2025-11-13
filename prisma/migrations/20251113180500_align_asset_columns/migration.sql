-- Ensure assets table columns match Prisma schema expectations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema
      AND indexname = 'assets_ticker_key'
  ) THEN
    DROP INDEX "assets_ticker_key";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema
      AND indexname = 'assets_ticker_idx'
  ) THEN
    DROP INDEX "assets_ticker_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema
      AND table_name = 'assets'
      AND column_name = 'ticker'
  ) THEN
    ALTER TABLE "assets" RENAME COLUMN "ticker" TO "symbol";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema
      AND table_name = 'assets'
      AND column_name = 'nome'
  ) THEN
    ALTER TABLE "assets" RENAME COLUMN "nome" TO "name";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema
      AND table_name = 'assets'
      AND column_name = 'tipo'
  ) THEN
    ALTER TABLE "assets" RENAME COLUMN "tipo" TO "type";
  END IF;
END $$;

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "currency" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'brapi';

UPDATE "assets"
SET "currency" = COALESCE("currency", 'BRL');

UPDATE "assets"
SET "source" = COALESCE("source", 'brapi');

UPDATE "assets"
SET "type" = COALESCE("type", 'other');

ALTER TABLE "assets"
  ALTER COLUMN "symbol" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "type" SET NOT NULL,
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "source" SET NOT NULL,
  ALTER COLUMN "source" SET DEFAULT 'brapi';

CREATE UNIQUE INDEX IF NOT EXISTS "assets_symbol_key" ON "assets"("symbol");
CREATE INDEX IF NOT EXISTS "assets_symbol_idx" ON "assets"("symbol");
CREATE INDEX IF NOT EXISTS "assets_type_idx" ON "assets"("type");
CREATE INDEX IF NOT EXISTS "assets_source_idx" ON "assets"("source");

ALTER TABLE "portfolios"
  ALTER COLUMN "stockId" DROP NOT NULL;

ALTER TABLE "stock_transactions"
  ALTER COLUMN "stockId" DROP NOT NULL;

