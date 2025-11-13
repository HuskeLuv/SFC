-- Ensure stock_transactions has the assetId column expected by the Prisma schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema
      AND table_name = 'stock_transactions'
      AND column_name = 'assetId'
  ) THEN
    ALTER TABLE "stock_transactions"
      ADD COLUMN "assetId" TEXT;
  END IF;
END $$;

-- Ensure foreign key constraint exists (will be ignored if already present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema
      AND table_name = 'stock_transactions'
      AND column_name = 'assetId'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'stock_transactions'
      AND kcu.column_name = 'assetId'
  ) THEN
    ALTER TABLE "stock_transactions"
      ADD CONSTRAINT "stock_transactions_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

