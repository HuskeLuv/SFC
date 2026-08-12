/**
 * Aplica a migration 20260812120000_add_dividas (tabelas dividas +
 * divida_pagamentos) via raw SQL + insert em _prisma_migrations. Workaround
 * pro schema drift conhecido do DB dev (memória project_prisma_schema_drift).
 * Idempotente.
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260812120000_add_dividas';

async function main() {
  console.log('=== Aplicando migration de dívidas ===');

  const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('dividas', 'divida_pagamentos');
  `);
  const has = new Set(tables.map((t) => t.table_name));

  if (!has.has('dividas')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "dividas" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "instituicao" TEXT,
        "tipo" TEXT NOT NULL,
        "modalidade" TEXT NOT NULL,
        "principal" DECIMAL(15,2),
        "taxaAm" DECIMAL(8,6),
        "taxaUnidadeEntrada" TEXT NOT NULL DEFAULT 'am',
        "prazoMeses" INTEGER,
        "sistema" TEXT,
        "indexador" TEXT NOT NULL DEFAULT 'PREFIXADO',
        "primeiroVencimento" TEXT,
        "saldoInicial" DECIMAL(15,2),
        "dataSaldoInicial" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ativa',
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "dividas_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "dividas" ADD CONSTRAINT "dividas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    );
    console.log('  ✓ tabela dividas criada');
  } else {
    console.log('  ✓ tabela dividas já existe');
  }

  if (!has.has('divida_pagamentos')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "divida_pagamentos" (
        "id" TEXT NOT NULL,
        "dividaId" TEXT NOT NULL,
        "month" TEXT NOT NULL,
        "valor" DECIMAL(15,2) NOT NULL,
        "parcelaNumero" INTEGER,
        "tipo" TEXT NOT NULL DEFAULT 'pagamento',
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "divida_pagamentos_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "divida_pagamentos" ADD CONSTRAINT "divida_pagamentos_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    );
    console.log('  ✓ tabela divida_pagamentos criada');
  } else {
    console.log('  ✓ tabela divida_pagamentos já existe');
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "dividas_userId_idx" ON "dividas"("userId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "dividas_userId_status_idx" ON "dividas"("userId", "status");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "divida_pagamentos_dividaId_idx" ON "divida_pagamentos"("dividaId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "divida_pagamentos_dividaId_month_idx" ON "divida_pagamentos"("dividaId", "month");`,
  );
  console.log('  ✓ índices');

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
