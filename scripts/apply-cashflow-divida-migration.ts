/**
 * Aplica a migration 20260812150000_add_cashflow_item_divida (coluna
 * CashflowItem.dividaId + unique + FK) via raw SQL + insert em
 * _prisma_migrations. Workaround pro schema drift conhecido do DB dev
 * (memória project_prisma_schema_drift). Idempotente.
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260812150000_add_cashflow_item_divida';

async function main() {
  console.log('=== Aplicando migration CashflowItem.dividaId ===');

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'CashflowItem' AND column_name = 'dividaId';
  `);
  if (cols.length === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "CashflowItem" ADD COLUMN "dividaId" TEXT;`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "CashflowItem_dividaId_key" ON "CashflowItem"("dividaId");`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
    );
    console.log('  ✓ coluna + índice + FK criados');
  } else {
    console.log('  ✓ coluna dividaId já existe');
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "migration_name" = $1;`,
    MIGRATION_NAME,
  );
  if (Number(existing[0].count) === 0) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "_prisma_migrations" (
        "id", "checksum", "finished_at", "migration_name", "logs",
        "rolled_back_at", "started_at", "applied_steps_count"
      ) VALUES (
        gen_random_uuid()::text, 'manual-apply-via-script', NOW(), $1,
        NULL, NULL, NOW(), 1
      );
    `,
      MIGRATION_NAME,
    );
    console.log(`  ✓ registrada em _prisma_migrations: ${MIGRATION_NAME}`);
  } else {
    console.log(`  ✓ ${MIGRATION_NAME} já estava registrada`);
  }

  console.log('\n=== Pronto ===');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
