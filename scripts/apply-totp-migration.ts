/**
 * Aplica os campos totpSecret + totpEnabled (LGPD #12) ao model User
 * via raw SQL + insert em _prisma_migrations. Workaround pra schema
 * drift conhecido (memória project_prisma_schema_drift).
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260528210000_add_totp_to_user';

async function main() {
  console.log('=== Aplicando TOTP migration ===');

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'User' AND column_name IN ('totpSecret', 'totpEnabled');
  `);
  const has = new Set(cols.map((c) => c.column_name));

  if (!has.has('totpSecret')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;`);
    console.log('  ✓ User.totpSecret');
  } else {
    console.log('  ✓ User.totpSecret já existe');
  }

  if (!has.has('totpEnabled')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;`,
    );
    console.log('  ✓ User.totpEnabled');
  } else {
    console.log('  ✓ User.totpEnabled já existe');
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
