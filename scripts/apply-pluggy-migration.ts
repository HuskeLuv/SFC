/**
 * Aplica a migration 20260914180000_add_pluggy_bank_ledger no banco de DEV
 * (Neon) via raw SQL + insert em _prisma_migrations. Workaround pro schema
 * drift conhecido do dev (memória project_prisma_schema_drift). Idempotente:
 * CREATE ... IF NOT EXISTS e constraints duplicadas são toleradas. Em prod o
 * deploy roda `prisma migrate deploy` com o mesmo arquivo.
 *
 *   npx tsx --env-file=.env scripts/apply-pluggy-migration.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260914180000_add_pluggy_bank_ledger';

async function main() {
  console.log(`=== Aplicando ${MIGRATION_NAME} ===`);
  const sql = readFileSync(
    join(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql'),
    'utf8',
  );
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log('  ✓', stmt.split('\n')[0].slice(0, 90));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      // 42710 duplicate_object (constraint já existe) — idempotência
      if (/already exists|42710|42P07/.test(msg)) {
        console.log('  = já existia:', stmt.split('\n')[0].slice(0, 80));
      } else {
        throw error;
      }
    }
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
