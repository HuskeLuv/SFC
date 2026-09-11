/**
 * Aplica a migration 20260910200000_agenda_event_fields (colunas novas em
 * "Event") via raw SQL + insert em _prisma_migrations. Workaround pro schema
 * drift conhecido do DB dev (memória project_prisma_schema_drift). Idempotente.
 * Em prod o deploy roda `prisma migrate deploy` normalmente.
 *
 *   npx tsx --env-file=.env scripts/apply-agenda-migration.ts
 */
import { prisma } from '../src/lib/prisma';

const MIGRATION_NAME = '20260910200000_agenda_event_fields';

const COLUNAS: Array<[string, string]> = [
  ['description', 'TEXT'],
  ['endDate', 'TIMESTAMP(3)'],
  ['hora', 'TEXT'],
  ['categoria', "TEXT NOT NULL DEFAULT 'pessoal'"],
  ['recorrencia', "TEXT NOT NULL DEFAULT 'nenhuma'"],
  ['lembrete', 'BOOLEAN NOT NULL DEFAULT false'],
  ['createdAt', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ['updatedAt', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
];

async function main() {
  console.log('=== Aplicando migration da agenda (Event) ===');
  const existentes = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Event';`,
  );
  const temColuna = new Set(existentes.map((c) => c.column_name));
  for (const [nome, tipo] of COLUNAS) {
    if (temColuna.has(nome)) {
      console.log(`  ✓ coluna ${nome} já existe`);
      continue;
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN "${nome}" ${tipo};`);
    console.log(`  ✓ coluna ${nome} criada`);
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Event_userId_date_idx" ON "Event"("userId", "date");`,
  );

  // FK com cascade: remove a constraint atual (nome pode variar no dev) e recria.
  const fks = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
    `SELECT constraint_name FROM information_schema.table_constraints
     WHERE table_name = 'Event' AND constraint_type = 'FOREIGN KEY';`,
  );
  for (const fk of fks) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" DROP CONSTRAINT "${fk.constraint_name}";`);
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
  );
  console.log('  ✓ FK Event.userId com ON DELETE CASCADE');

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
