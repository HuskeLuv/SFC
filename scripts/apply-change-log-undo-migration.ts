/**
 * Aplica os campos de undo (snapshot, undoneAt, undoneById, revertsId) e o
 * índice por entidade em user_change_logs via raw SQL + insert em
 * _prisma_migrations. Workaround pro schema drift conhecido do DB dev
 * (memória project_prisma_schema_drift).
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260710120000_add_user_change_log_undo';

async function main() {
  console.log('=== Aplicando migration de undo do histórico ===');

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'user_change_logs'
      AND column_name IN ('snapshot', 'undoneAt', 'undoneById', 'revertsId');
  `);
  const has = new Set(cols.map((c) => c.column_name));

  const columns: Array<[string, string]> = [
    ['snapshot', `ALTER TABLE "user_change_logs" ADD COLUMN "snapshot" JSONB;`],
    ['undoneAt', `ALTER TABLE "user_change_logs" ADD COLUMN "undoneAt" TIMESTAMP(3);`],
    ['undoneById', `ALTER TABLE "user_change_logs" ADD COLUMN "undoneById" TEXT;`],
    ['revertsId', `ALTER TABLE "user_change_logs" ADD COLUMN "revertsId" TEXT;`],
  ];
  for (const [name, sql] of columns) {
    if (!has.has(name)) {
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ✓ user_change_logs.${name}`);
    } else {
      console.log(`  ✓ user_change_logs.${name} já existe`);
    }
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_change_logs_userId_entityId_createdAt_idx"
      ON "user_change_logs"("userId", "entityId", "createdAt");
  `);
  console.log('  ✓ índice userId+entityId+createdAt');

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
