/**
 * Aplica a migration da v2.4 da Análise de Ativos (Filtros de Fundamentos: tabelas criteria_params
 * e criteria_eval + colunas anuláveis criterios/perfilCriterios em analise_quadro_linhas) no banco
 * de DEV (Neon) sem `prisma migrate dev` — o dev tem drift e o migrate dev propõe reset (memória
 * project_prisma_schema_drift). Molde: apply-migration-bloco-d.ts.
 *
 * O migration.sql commitado JÁ é idempotente (CREATE TABLE/INDEX IF NOT EXISTS e ALTER TABLE … ADD
 * COLUMN IF NOT EXISTS): o mesmo arquivo serve ao `prisma migrate deploy` do CI e da produção. Cada
 * statement é executado como está e a migration é registrada em _prisma_migrations (checksum =
 * sha256 do arquivo, igual ao do Prisma) só se ausente. Rodar 2× não muda nada.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-filtros.ts           # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-filtros.ts --apply   # executa
 *
 * Recusa qualquer statement que não seja CREATE TABLE IF NOT EXISTS, CREATE [UNIQUE] INDEX IF NOT
 * EXISTS ou ADD COLUMN IF NOT EXISTS de coluna ANULÁVEL (sem NOT NULL nem DEFAULT) em
 * "analise_quadro_linhas". Depois: npx prisma generate (e reiniciar o dev server).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { dividirStatementsComBlocos } from './apply-migration-bloco-d';
import { exigirAditivoIdempotente } from './apply-migration-fase1';

export const MIGRATION_NAME = '20261015000000_analise_ativos_filtros';
export const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);

/** Única tabela existente que esta migration pode alterar (só acrescentando coluna anulável). */
const TABELA_ALTERAVEL = 'analise_quadro_linhas';

const RE_ADD_COLUMN = new RegExp(
  `^ALTER TABLE "${TABELA_ALTERAVEL}" ADD COLUMN IF NOT EXISTS "[A-Za-z]+" (JSONB|TEXT|INTEGER|DOUBLE PRECISION|BOOLEAN)$`,
);

/** Aceita CREATE TABLE/INDEX IF NOT EXISTS e ADD COLUMN IF NOT EXISTS anulável; lança para o resto. */
export function exigirAditivoFiltros(stmt: string): string {
  if (stmt.startsWith('ALTER TABLE')) {
    if (RE_ADD_COLUMN.test(stmt)) return stmt;
    throw new Error(`Statement não aditivo/idempotente recusado: ${stmt.slice(0, 120)}`);
  }
  return exigirAditivoIdempotente(stmt);
}

/** Divide o SQL e recusa (lança) qualquer statement que não seja aditivo e idempotente. */
export function statementsAditivosFiltros(conteudo: string): string[] {
  return dividirStatementsComBlocos(conteudo).map(exigirAditivoFiltros);
}

export function lerStatementsFiltros(): { conteudo: string; statements: string[] } {
  const conteudo = readFileSync(MIGRATION_FILE, 'utf8');
  return { conteudo, statements: statementsAditivosFiltros(conteudo) };
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const { conteudo, statements } = lerStatementsFiltros();
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

    const colunas = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = '${TABELA_ALTERAVEL}' AND column_name IN ('criterios', 'perfilCriterios')
        ORDER BY column_name;`,
    );
    console.log(`  ✓ colunas novas: ${colunas.map((c) => c.column_name).join(', ') || 'AUSENTES'}`);
    const tabelas = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('criteria_params', 'criteria_eval') ORDER BY table_name;`,
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
