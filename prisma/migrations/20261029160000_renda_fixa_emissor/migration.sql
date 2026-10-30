-- Emissor na renda fixa + FGC por emissor (ClickUp 86e2xqh69). ADITIVA e idempotente.
-- Rollback (não rodar sem OK; o código antigo ignora as colunas):
--   ALTER TABLE "fixed_income_assets" DROP CONSTRAINT IF EXISTS "fixed_income_assets_emissorInstitutionId_fkey";
--   DROP INDEX IF EXISTS "fixed_income_assets_emissorInstitutionId_idx";
--   ALTER TABLE "fixed_income_assets" DROP COLUMN IF EXISTS "emissorInstitutionId";
--   DROP INDEX IF EXISTS "institutions_tipoBacen_idx";
--   DROP INDEX IF EXISTS "institutions_conglomeradoBacen_idx";
--   ALTER TABLE "institutions" DROP COLUMN IF EXISTS "tipoBacen", DROP COLUMN IF EXISTS "conglomeradoBacen",
--     DROP COLUMN IF EXISTS "apelidos", DROP COLUMN IF EXISTS "cnpjCalculado";
--   ALTER TABLE "bank_investments" DROP COLUMN IF EXISTS "issuerCnpj";

ALTER TABLE "fixed_income_assets" ADD COLUMN IF NOT EXISTS "emissorInstitutionId" TEXT;
CREATE INDEX IF NOT EXISTS "fixed_income_assets_emissorInstitutionId_idx" ON "fixed_income_assets"("emissorInstitutionId");
DO $$ BEGIN
  ALTER TABLE "fixed_income_assets" ADD CONSTRAINT "fixed_income_assets_emissorInstitutionId_fkey"
    FOREIGN KEY ("emissorInstitutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "tipoBacen" TEXT;
ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "conglomeradoBacen" TEXT;
ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "apelidos" TEXT;
ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "cnpjCalculado" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "institutions_tipoBacen_idx" ON "institutions"("tipoBacen");
CREATE INDEX IF NOT EXISTS "institutions_conglomeradoBacen_idx" ON "institutions"("conglomeradoBacen");

ALTER TABLE "bank_investments" ADD COLUMN IF NOT EXISTS "issuerCnpj" TEXT;
