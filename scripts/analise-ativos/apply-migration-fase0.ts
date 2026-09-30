/**
 * Aplica a migration da Fase 0 da Análise de Ativos no banco de DEV (Neon) sem `prisma migrate dev`
 * — o dev tem drift e o migrate dev propõe reset (memória project_prisma_schema_drift).
 *
 * O migration.sql commitado é o do `prisma migrate diff` puro (é o que o CI e a produção aplicam com
 * `prisma migrate deploy`). Aqui cada statement é reescrito com IF NOT EXISTS para ser idempotente e
 * a migration é registrada em _prisma_migrations (checksum = sha256 do arquivo, igual ao do Prisma)
 * só se ausente.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-fase0.ts           # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-fase0.ts --apply   # executa
 *
 * Recusa qualquer statement que não seja CREATE TABLE / CREATE [UNIQUE] INDEX (migration aditiva).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATION_NAME = '20260930180000_analise_ativos_fase0';
const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);

/** Divide o SQL do migrate diff em statements (não há funções/blocos $$ neste arquivo). */
export function dividirStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) =>
      s
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);
}

/** Reescreve CREATE TABLE/INDEX com IF NOT EXISTS; lança para qualquer outro tipo de statement. */
export function tornarIdempotente(stmt: string): string {
  if (/^CREATE TABLE "/.test(stmt))
    return stmt.replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ');
  if (/^CREATE (UNIQUE )?INDEX "/.test(stmt)) {
    return stmt.replace(/^CREATE (UNIQUE )?INDEX /, (m) => `${m}IF NOT EXISTS `);
  }
  throw new Error(`Statement não aditivo recusado: ${stmt.slice(0, 120)}`);
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const conteudo = readFileSync(MIGRATION_FILE, 'utf8');
  const checksum = createHash('sha256').update(conteudo).digest('hex');
  const statements = dividirStatements(conteudo).map(tornarIdempotente);

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
