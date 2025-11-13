-- Ensure portfolios table has the assetId column and constraints expected by Prisma schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema
      AND table_name = 'portfolios'
      AND column_name = 'assetId'
  ) THEN
    ALTER TABLE "portfolios"
      ADD COLUMN "assetId" TEXT;
  END IF;
END $$;

-- Add foreign key constraint if missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema
      AND table_name = 'portfolios'
      AND column_name = 'assetId'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'portfolios'
      AND kcu.column_name = 'assetId'
  ) THEN
    ALTER TABLE "portfolios"
      ADD CONSTRAINT "portfolios_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Ensure unique index on (userId, assetId)
CREATE UNIQUE INDEX IF NOT EXISTS "portfolios_userId_assetId_key"
  ON "portfolios"("userId", "assetId");

-- Ensure unique index on (userId, stockId)
CREATE UNIQUE INDEX IF NOT EXISTS "portfolios_userId_stockId_key"
  ON "portfolios"("userId", "stockId");

