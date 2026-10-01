/**
 * Aplica a migration 20261001120000_carteira_mover_override (colunas
 * "categoriaOverride" e "tipoFundo" em "portfolios" e "categoriaOverride" em
 * "watchlists") via raw SQL + insert em _prisma_migrations. Workaround pro
 * schema drift conhecido do DB dev (memória project_prisma_schema_drift).
 * Idempotente. Em prod o deploy roda `prisma migrate deploy` normalmente.
 *
 *   npx tsx --env-file=.env scripts/apply-carteira-mover-migration.ts
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20261001120000_carteira_mover_override';

const COLUNAS: Array<{ tabela: string; coluna: string }> = [
  { tabela: 'portfolios', coluna: 'categoriaOverride' },
  { tabela: 'portfolios', coluna: 'tipoFundo' },
  { tabela: 'watchlists', coluna: 'categoriaOverride' },
];

async function main() {
  console.log('=== Aplicando migration do mover na Carteira (override de aba) ===');
  for (const { tabela, coluna } of COLUNAS) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${tabela}" ADD COLUMN IF NOT EXISTS "${coluna}" TEXT;`,
    );
    console.log(`  ✓ coluna ${tabela}.${coluna} garantida`);
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
