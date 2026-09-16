-- Ativo planejado (16/09/2026): Watchlist ganha objetivo e seção, e passa a
-- ser única por (userId, assetId). Ver comentário do model no schema.
ALTER TABLE "watchlists" ADD COLUMN "objetivo" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "watchlists" ADD COLUMN "secao" TEXT;
CREATE UNIQUE INDEX "watchlists_userId_assetId_key" ON "watchlists"("userId", "assetId");
