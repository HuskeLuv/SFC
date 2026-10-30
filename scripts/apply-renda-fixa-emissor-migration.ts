/**
 * Aplica a migration 20261029160000_renda_fixa_emissor (ClickUp 86e2xqh69):
 * - "fixed_income_assets"."emissorInstitutionId" (FK SetNull para "institutions") + índice;
 * - "institutions"."tipoBacen", "conglomeradoBacen", "apelidos", "cnpjCalculado" + índices;
 * - "bank_investments"."issuerCnpj".
 * Via raw SQL + insert em _prisma_migrations. Workaround pro schema drift conhecido do
 * DB dev (memória project_prisma_schema_drift). Idempotente. Em prod o deploy roda
 * `prisma migrate deploy` normalmente.
 *
 *   DATABASE_URL=... npx tsx scripts/apply-renda-fixa-emissor-migration.ts
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20261029160000_renda_fixa_emissor';

/** Mesmos comandos de prisma/migrations/20261029160000_renda_fixa_emissor/migration.sql. */
const COMANDOS: Array<{ rotulo: string; sql: string }> = [
  {
    rotulo: 'coluna fixed_income_assets.emissorInstitutionId',
    sql: `ALTER TABLE "fixed_income_assets" ADD COLUMN IF NOT EXISTS "emissorInstitutionId" TEXT;`,
  },
  {
    rotulo: 'índice fixed_income_assets_emissorInstitutionId_idx',
    sql: `CREATE INDEX IF NOT EXISTS "fixed_income_assets_emissorInstitutionId_idx" ON "fixed_income_assets"("emissorInstitutionId");`,
  },
  {
    rotulo: 'FK fixed_income_assets_emissorInstitutionId_fkey (ON DELETE SET NULL)',
    sql: `DO $$ BEGIN
  ALTER TABLE "fixed_income_assets" ADD CONSTRAINT "fixed_income_assets_emissorInstitutionId_fkey"
    FOREIGN KEY ("emissorInstitutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  },
  {
    rotulo: 'coluna institutions.tipoBacen',
    sql: `ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "tipoBacen" TEXT;`,
  },
  {
    rotulo: 'coluna institutions.conglomeradoBacen',
    sql: `ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "conglomeradoBacen" TEXT;`,
  },
  {
    rotulo: 'coluna institutions.apelidos',
    sql: `ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "apelidos" TEXT;`,
  },
  {
    rotulo: 'coluna institutions.cnpjCalculado',
    sql: `ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "cnpjCalculado" BOOLEAN NOT NULL DEFAULT false;`,
  },
  {
    rotulo: 'índice institutions_tipoBacen_idx',
    sql: `CREATE INDEX IF NOT EXISTS "institutions_tipoBacen_idx" ON "institutions"("tipoBacen");`,
  },
  {
    rotulo: 'índice institutions_conglomeradoBacen_idx',
    sql: `CREATE INDEX IF NOT EXISTS "institutions_conglomeradoBacen_idx" ON "institutions"("conglomeradoBacen");`,
  },
  {
    rotulo: 'coluna bank_investments.issuerCnpj',
    sql: `ALTER TABLE "bank_investments" ADD COLUMN IF NOT EXISTS "issuerCnpj" TEXT;`,
  },
];

async function main() {
  console.log('=== Aplicando migration do emissor na renda fixa (FGC por emissor) ===');
  for (const { rotulo, sql } of COMANDOS) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${rotulo}`);
  }

  const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1;`,
    MIGRATION_NAME,
  );
  if (applied.length === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
       VALUES (gen_random_uuid()::text, 'manual-apply-via-script', NOW(), $1, NULL, NULL, NOW(), 1);`,
      MIGRATION_NAME,
    );
    console.log(`  ✓ ${MIGRATION_NAME} registrada em _prisma_migrations`);
  } else {
    console.log(`  ✓ ${MIGRATION_NAME} já registrada`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
