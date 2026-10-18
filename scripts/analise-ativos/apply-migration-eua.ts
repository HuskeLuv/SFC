/**
 * Aplica a migration da feature Stocks e REITs (EUA) da Análise de Ativos (fatia 0: tabelas
 * sec_companies, sec_company_tickers e asset_quotes_daily_us + colunas ANULÁVEIS em
 * asset_fundamentals_period e analise_quadro_linhas) num banco sem `prisma migrate dev` — o dev
 * pode ter drift e o migrate dev propõe reset (memória project_prisma_schema_drift). Molde:
 * apply-migration-fontes-alvos.ts.
 *
 * O migration.sql commitado JÁ é idempotente (CREATE TABLE/INDEX IF NOT EXISTS e ADD COLUMN IF NOT
 * EXISTS de colunas anuláveis): o mesmo arquivo serve ao `prisma migrate deploy` do CI e da
 * produção. Cada statement é executado como está e a migration é registrada em _prisma_migrations
 * (checksum = sha256 do arquivo, igual ao do Prisma) só se ausente. Rodar 2× não muda nada.
 *
 * Uso (banco de DEV = Postgres local no Docker; NUNCA produção por aqui):
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sfc_test?schema=public" \
 *     npx tsx scripts/analise-ativos/apply-migration-eua.ts           # dry-run
 *   DATABASE_URL=… npx tsx scripts/analise-ativos/apply-migration-eua.ts --apply   # executa
 *
 * Recusa qualquer statement que não seja CREATE TABLE IF NOT EXISTS, CREATE [UNIQUE] INDEX IF NOT
 * EXISTS ou ADD COLUMN IF NOT EXISTS de uma coluna da lista COLUNAS_NOVAS (tipo anulável, sem
 * DEFAULT/NOT NULL). Depois: npx prisma generate (e reiniciar o dev server).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { dividirStatementsComBlocos, exigirAditivoBlocoD } from './apply-migration-bloco-d';

export const MIGRATION_NAME = '20261017120000_analise_ativos_eua';
export const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);

/** Únicas colunas que a migration pode acrescentar em tabelas existentes (todas anuláveis). */
export const COLUNAS_NOVAS: Readonly<Record<string, readonly string[]>> = {
  asset_fundamentals_period: ['acoesMediaDiluida', 'dpa', 'dpaOrigem', 'recompras'],
  analise_quadro_linhas: ['moeda', 'bolsa', 'dpa', 'fcoPorAcao', 'dividendosFcoPct'],
};

export const TABELAS_NOVAS = ['sec_companies', 'sec_company_tickers', 'asset_quotes_daily_us'];

const RE_ADD_COLUMN =
  /^ALTER TABLE "([a-z_]+)" ADD COLUMN IF NOT EXISTS "([A-Za-z]+)" (TEXT|DOUBLE PRECISION|DECIMAL\(\d+,\d+\))$/;

/** Aceita CREATE TABLE/INDEX IF NOT EXISTS e o ADD COLUMN anulável da lista; lança no resto. */
export function exigirAditivoEua(stmt: string): string {
  if (stmt.startsWith('ALTER TABLE')) {
    const m = RE_ADD_COLUMN.exec(stmt);
    if (m && COLUNAS_NOVAS[m[1]]?.includes(m[2])) return stmt;
    throw new Error(`Statement não aditivo/idempotente recusado: ${stmt.slice(0, 120)}`);
  }
  return exigirAditivoBlocoD(stmt);
}

/** Divide o SQL e recusa (lança) qualquer statement que não seja aditivo e idempotente. */
export function statementsAditivosEua(conteudo: string): string[] {
  return dividirStatementsComBlocos(conteudo).map(exigirAditivoEua);
}

export function lerStatementsEua(): { conteudo: string; statements: string[] } {
  const conteudo = readFileSync(MIGRATION_FILE, 'utf8');
  return { conteudo, statements: statementsAditivosEua(conteudo) };
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const { conteudo, statements } = lerStatementsEua();
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

    const tabelas = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN (${TABELAS_NOVAS.map((t) => `'${t}'`).join(', ')})
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
