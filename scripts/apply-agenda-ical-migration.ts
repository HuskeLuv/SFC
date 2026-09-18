/**
 * Aplica a migration 20260918180000_agenda_ical_token (colunas do feed iCal
 * em "agenda_preferencias") via raw SQL + insert em _prisma_migrations.
 * Workaround pro schema drift conhecido do DB dev. Idempotente.
 *
 *   npx tsx --env-file=.env scripts/apply-agenda-ical-migration.ts
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260918180000_agenda_ical_token';

async function main() {
  console.log('=== Aplicando migration do feed iCal ===');
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "agenda_preferencias" ADD COLUMN IF NOT EXISTS "icalToken" TEXT;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "agenda_preferencias" ADD COLUMN IF NOT EXISTS "icalCriadoEm" TIMESTAMP(3);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "agenda_preferencias_icalToken_key" ON "agenda_preferencias"("icalToken");`,
  );
  console.log('  ✓ colunas icalToken/icalCriadoEm garantidas');

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
