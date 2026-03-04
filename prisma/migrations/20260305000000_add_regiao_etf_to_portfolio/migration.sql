-- AlterTable: adicionar regiaoEtf ao Portfolio para ETFs
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "regiaoEtf" TEXT;
