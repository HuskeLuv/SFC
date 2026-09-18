/**
 * Aplica a migration 20260918160000_agenda_preferencias (tabela
 * "agenda_preferencias") via raw SQL + insert em _prisma_migrations.
 * Workaround pro schema drift conhecido do DB dev (memória
 * project_prisma_schema_drift). Idempotente. Em prod o deploy roda
 * `prisma migrate deploy` normalmente.
 *
 *   npx tsx --env-file=.env scripts/apply-agenda-preferencias-migration.ts
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260918160000_agenda_preferencias';

async function main() {
  console.log('=== Aplicando migration das preferências da agenda ===');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "agenda_preferencias" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "lembretes" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "agenda_preferencias_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "agenda_preferencias_userId_key" ON "agenda_preferencias"("userId");`,
  );
  const fks = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
    `SELECT constraint_name FROM information_schema.table_constraints
     WHERE table_name = 'agenda_preferencias' AND constraint_type = 'FOREIGN KEY';`,
  );
  if (fks.length === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "agenda_preferencias" ADD CONSTRAINT "agenda_preferencias_userId_fkey"
       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    );
  }
  console.log('  ✓ tabela agenda_preferencias garantida');

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
