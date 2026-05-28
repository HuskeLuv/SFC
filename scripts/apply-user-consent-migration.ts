/**
 * Aplica a migration do model UserConsent (LGPD #5 Fase 2) via raw SQL
 * + insert manual em _prisma_migrations. Workaround pra schema drift
 * documentado em [[project_prisma_schema_drift]] — `prisma migrate dev`
 * pede reset, que apaga dados de produção.
 *
 * Idempotente: usa CREATE TABLE/INDEX IF NOT EXISTS e checa antes de
 * registrar a migration no _prisma_migrations.
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260528200000_add_user_consent';

async function main() {
  console.log('=== Aplicando UserConsent migration ===');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "user_consents" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "documentType" TEXT NOT NULL,
      "documentVersion" TEXT NOT NULL,
      "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "revokedAt" TIMESTAMP(3),
      CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
    );
  `);
  console.log('  ✓ tabela user_consents');

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "user_consents_userId_idx" ON "user_consents"("userId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "user_consents_userId_documentType_idx" ON "user_consents"("userId", "documentType");`,
  );
  console.log('  ✓ índices');

  // FK só se não existir já (Postgres não tem IF NOT EXISTS pra constraint).
  const fkExists = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.table_constraints
    WHERE table_name = 'user_consents'
      AND constraint_name = 'user_consents_userId_fkey';
  `);
  if (Number(fkExists[0].count) === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    console.log('  ✓ FK user_consents → users');
  } else {
    console.log('  ✓ FK já existe');
  }

  // Registra a migration em _prisma_migrations pra evitar drift na próxima.
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
        gen_random_uuid()::text,
        'manual-apply-via-script',
        NOW(),
        $1,
        NULL,
        NULL,
        NOW(),
        1
      );
    `,
      MIGRATION_NAME,
    );
    console.log(`  ✓ registrada em _prisma_migrations: ${MIGRATION_NAME}`);
  } else {
    console.log(`  ✓ ${MIGRATION_NAME} já estava em _prisma_migrations`);
  }

  console.log('\n=== Pronto ===');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
