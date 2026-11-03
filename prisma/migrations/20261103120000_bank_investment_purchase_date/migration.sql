-- Data da compra informada pelo Open Finance (purchaseDate). ADITIVA, nula e idempotente: as
-- linhas existentes ganham o valor na próxima sincronização.
-- Rollback (o código antigo ignora a coluna): ALTER TABLE "bank_investments" DROP COLUMN IF EXISTS "purchaseDate";
ALTER TABLE "bank_investments" ADD COLUMN IF NOT EXISTS "purchaseDate" TIMESTAMP(3);
