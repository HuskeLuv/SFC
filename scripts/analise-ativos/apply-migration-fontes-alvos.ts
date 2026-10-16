/**
 * Aplica a migration da v2.5 da Análise de Ativos (camada de fontes + alvo por ativo: tabelas
 * asset_fundamentals_serie, fii_property_quality e planning_asset_targets + coluna anulável
 * "reviewedBy" em asset_fundamentals_period, fii_monthly e fii_quarterly) no banco de DEV (Neon) sem
 * `prisma migrate dev` — o dev tem drift e o migrate dev propõe reset (memória
 * project_prisma_schema_drift). Molde: apply-migration-filtros.ts.
 *
 * O migration.sql commitado JÁ é idempotente (CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT
 * EXISTS e FK em DO $$ … EXCEPTION WHEN duplicate_object): o mesmo arquivo serve ao
 * `prisma migrate deploy` do CI e da produção. Cada statement é executado como está e a migration é
 * registrada em _prisma_migrations (checksum = sha256 do arquivo, igual ao do Prisma) só se
 * ausente. Rodar 2× não muda nada.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-fontes-alvos.ts           # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-fontes-alvos.ts --apply   # executa
 *
 * Recusa qualquer statement que não seja CREATE TABLE IF NOT EXISTS, CREATE [UNIQUE] INDEX IF NOT
 * EXISTS, o bloco DO de FK idempotente ou ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT (anulável) nas
 * 3 tabelas da CVM. Depois: npx prisma generate (e reiniciar o dev server).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { dividirStatementsComBlocos, exigirAditivoBlocoD } from './apply-migration-bloco-d';

export const MIGRATION_NAME = '20261016000000_analise_ativos_fontes_alvos';
export const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);

/** Únicas tabelas existentes que esta migration pode alterar (só a coluna anulável reviewedBy). */
export const TABELAS_ALTERAVEIS = ['asset_fundamentals_period', 'fii_monthly', 'fii_quarterly'];

const RE_ADD_COLUMN = new RegExp(
  `^ALTER TABLE "(${TABELAS_ALTERAVEIS.join('|')})" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT$`,
);

/** Aceita CREATE TABLE/INDEX IF NOT EXISTS, FK em DO $$ e o ADD COLUMN reviewedBy; lança no resto. */
export function exigirAditivoFontesAlvos(stmt: string): string {
  if (stmt.startsWith('ALTER TABLE')) {
    if (RE_ADD_COLUMN.test(stmt)) return stmt;
    throw new Error(`Statement não aditivo/idempotente recusado: ${stmt.slice(0, 120)}`);
  }
  return exigirAditivoBlocoD(stmt);
}

/** Divide o SQL e recusa (lança) qualquer statement que não seja aditivo e idempotente. */
export function statementsAditivosFontesAlvos(conteudo: string): string[] {
  return dividirStatementsComBlocos(conteudo).map(exigirAditivoFontesAlvos);
}

export function lerStatementsFontesAlvos(): { conteudo: string; statements: string[] } {
  const conteudo = readFileSync(MIGRATION_FILE, 'utf8');
  return { conteudo, statements: statementsAditivosFontesAlvos(conteudo) };
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const { conteudo, statements } = lerStatementsFontesAlvos();
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

    const colunas = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns
        WHERE column_name = 'reviewedBy' AND table_name IN (${TABELAS_ALTERAVEIS.map((t) => `'${t}'`).join(', ')})
        ORDER BY table_name;`,
    );
    console.log(
      `  ✓ reviewedBy em: ${colunas.map((c) => c.table_name).join(', ') || 'AUSENTE'} (esperado 3)`,
    );
    const tabelas = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('asset_fundamentals_serie', 'fii_property_quality', 'planning_asset_targets')
        ORDER BY table_name;`,
    );
    console.log(`  ✓ tabelas: ${tabelas.map((t) => t.table_name).join(', ') || 'AUSENTES'}`);
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
