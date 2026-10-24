-- Tesouraria por classe em asset_share_counts (valor de mercado com tesouraria, igual ao Fundamentei).
-- Aditiva e idempotente: colunas nulas; preenchidas pelo backfill-cvm-cias --revisitar.
ALTER TABLE "asset_share_counts" ADD COLUMN IF NOT EXISTS "tesourariaOn" DECIMAL(20,0);
ALTER TABLE "asset_share_counts" ADD COLUMN IF NOT EXISTS "tesourariaPn" DECIMAL(20,0);
