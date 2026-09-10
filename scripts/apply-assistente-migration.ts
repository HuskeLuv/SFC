/**
 * Aplica a migration 20260910150000_add_assistente_mensagens (tabela
 * assistente_mensagens) via raw SQL + insert em _prisma_migrations. Workaround
 * pro schema drift conhecido do DB dev (memória project_prisma_schema_drift).
 * Idempotente. Em prod o deploy roda `prisma migrate deploy` normalmente.
 *
 *   npx tsx --env-file=.env scripts/apply-assistente-migration.ts
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260910150000_add_assistente_mensagens';

async function main() {
  console.log('=== Aplicando migration do assistente ===');

  const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'assistente_mensagens';
  `);

  if (tables.length === 0) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "assistente_mensagens" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "actorId" TEXT NOT NULL,
        "viaConsultant" BOOLEAN NOT NULL DEFAULT false,
        "intencao" TEXT NOT NULL,
        "motor" TEXT NOT NULL,
        "modelo" TEXT NOT NULL,
        "inputTokens" INTEGER NOT NULL DEFAULT 0,
        "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
        "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
        "outputTokens" INTEGER NOT NULL DEFAULT 0,
        "custoBrl" DECIMAL(10,6) NOT NULL DEFAULT 0,
        "latencyMs" INTEGER NOT NULL DEFAULT 0,
        "stopReason" TEXT NOT NULL DEFAULT 'n/a',
        "ok" BOOLEAN NOT NULL DEFAULT true,
        "propostaGerada" BOOLEAN NOT NULL DEFAULT false,
        "propostaConfirmada" BOOLEAN NOT NULL DEFAULT false,
        "textoUsuario" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "assistente_mensagens_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "assistente_mensagens" ADD CONSTRAINT "assistente_mensagens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    );
    console.log('  ✓ tabela assistente_mensagens criada');
  } else {
    console.log('  ✓ tabela assistente_mensagens já existe');
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "assistente_mensagens_userId_createdAt_idx" ON "assistente_mensagens"("userId", "createdAt");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "assistente_mensagens_createdAt_idx" ON "assistente_mensagens"("createdAt");`,
  );

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
