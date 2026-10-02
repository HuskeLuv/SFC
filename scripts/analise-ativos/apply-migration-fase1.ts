/**
 * Aplica a migration da Fase 1 da Análise de Ativos no banco de DEV (Neon) sem `prisma migrate dev`
 * — o dev tem drift e o migrate dev propõe reset (memória project_prisma_schema_drift).
 *
 * Diferente da Fase 0, o migration.sql commitado JÁ é idempotente (CREATE TABLE/INDEX IF NOT
 * EXISTS, com as FKs para "User" dentro do CREATE TABLE): o mesmo arquivo serve ao `prisma migrate
 * deploy` (CI e produção) e a este script. Cada statement é executado como está e a migration é
 * registrada em _prisma_migrations (checksum = sha256 do arquivo, igual ao do Prisma) só se ausente.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-fase1.ts           # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-fase1.ts --apply   # executa
 *
 * Recusa qualquer statement que não seja CREATE TABLE IF NOT EXISTS / CREATE [UNIQUE] INDEX IF NOT
 * EXISTS (migration aditiva e idempotente).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { dividirStatements } from './apply-migration-fase0';

export const MIGRATION_NAME = '20261005000000_analise_ativos_fase1';
const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);

/** Lança para statement que não seja CREATE TABLE/INDEX com IF NOT EXISTS. */
export function exigirAditivoIdempotente(stmt: string): string {
  if (/^CREATE TABLE IF NOT EXISTS "/.test(stmt)) return stmt;
  if (/^CREATE (UNIQUE )?INDEX IF NOT EXISTS "/.test(stmt)) return stmt;
  throw new Error(`Statement não aditivo/idempotente recusado: ${stmt.slice(0, 120)}`);
}

export function lerStatementsFase1(): { conteudo: string; statements: string[] } {
  const conteudo = readFileSync(MIGRATION_FILE, 'utf8');
  return { conteudo, statements: dividirStatements(conteudo).map(exigirAditivoIdempotente) };
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const { conteudo, statements } = lerStatementsFase1();
  const checksum = createHash('sha256').update(conteudo).digest('hex');

  console.log(`=== ${MIGRATION_NAME} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log(`checksum ${checksum} · ${statements.length} statements`);
  for (const s of statements) console.log(`  ${s.split('\n')[0]}`);

  if (!aplicar) {
    console.log('\nDry-run: nada executado. Use --apply para executar.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const s of statements) await prisma.$executeRawUnsafe(s);
    console.log(`  ✓ ${statements.length} statements executados`);

    const existente = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "migration_name" = $1;`,
      MIGRATION_NAME,
    );
    if (Number(existente[0].count) === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (
           "id", "checksum", "finished_at", "migration_name", "logs",
           "rolled_back_at", "started_at", "applied_steps_count"
         ) VALUES (gen_random_uuid()::text, $1, NOW(), $2, NULL, NULL, NOW(), 1);`,
        checksum,
        MIGRATION_NAME,
      );
      console.log('  ✓ registrada em _prisma_migrations');
    } else {
      console.log('  ✓ já registrada em _prisma_migrations');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
