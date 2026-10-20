/**
 * Aplica a migration da A6 da Análise de Ativos (dados complementares: imóveis do FII, setores dos
 * locatários, retornos da cotação, FRE societário; colunas ANULÁVEIS em asset_fundamentals_period,
 * fii_monthly, asset_multiples_yearly/current e analise_quadro_linhas) num banco sem
 * `prisma migrate dev` — o dev pode ter drift e o migrate dev propõe reset (memória
 * project_prisma_schema_drift). Molde: apply-migration-eua.ts.
 *
 * O migration.sql commitado JÁ é idempotente (CREATE TABLE/INDEX IF NOT EXISTS e ADD COLUMN IF NOT
 * EXISTS de colunas anuláveis): o mesmo arquivo serve ao `prisma migrate deploy` do CI e da
 * produção. Cada statement é executado como está e a migration é registrada em _prisma_migrations
 * (checksum = sha256 do arquivo, igual ao do Prisma) só se ausente. Rodar 2× não muda nada.
 *
 * Uso (banco de DEV = Postgres local no Docker; NUNCA produção por aqui — produção recebe pelo
 * prisma migrate deploy do deploy.sh):
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sfc_test?schema=public" \
 *     npx tsx scripts/analise-ativos/apply-migration-dados-complementares.ts           # dry-run
 *   DATABASE_URL=… npx tsx scripts/analise-ativos/apply-migration-dados-complementares.ts --apply
 *
 * Lista FECHADA: recusa qualquer statement que não seja CREATE TABLE IF NOT EXISTS de uma tabela de
 * TABELAS_NOVAS, CREATE [UNIQUE] INDEX IF NOT EXISTS numa delas, ou ADD COLUMN IF NOT EXISTS de uma
 * coluna de COLUNAS_NOVAS (tipo anulável, sem DEFAULT/NOT NULL). Depois: npx prisma generate (e
 * reiniciar o dev server).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { dividirStatementsComBlocos } from './apply-migration-bloco-d';

export const MIGRATION_NAME = '20261020000000_analise_ativos_dados_complementares';
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
  asset_fundamentals_period: [
    'pdd',
    'receitaIntermediacaoDva',
    'resultadoFinanceiro',
    'equivalenciaPatrimonial',
    'receitaComissoesServicos',
    'receitaSeguro',
    'despesaSeguro',
    'premiosGanhos',
    'sinistrosRetidos',
  ],
  fii_monthly: ['outrosValoresPagar', 'valoresReceber', 'obrigacoesAtivoPct'],
  asset_multiples_yearly: ['obrigacoesAtivoPct'],
  asset_multiples_current: ['obrigacoesAtivoPct'],
  analise_quadro_linhas: ['obrigacoesAtivoPct'],
};

export const TABELAS_NOVAS = [
  'fii_imovel_trimestral',
  'fii_inquilino_setor_trimestral',
  'asset_retornos_cotacao',
  'cia_fre_posicao_acionaria',
  'cia_fre_societario',
  'cia_fre_direito_acao',
] as const;

const RE_ADD_COLUMN =
  /^ALTER TABLE "([a-z_]+)" ADD COLUMN IF NOT EXISTS "([A-Za-z]+)" (TEXT|DOUBLE PRECISION|DECIMAL\(\d+,\d+\))$/;
const RE_CREATE_TABLE = /^CREATE TABLE IF NOT EXISTS "([a-z_]+)" \(/;
const RE_CREATE_INDEX = /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "[A-Za-z_]+" ON "([a-z_]+)"\(/;
/** Nada que apague, renomeie, mude tipo ou crie vínculo, nem dentro de um CREATE TABLE. */
const RE_DESTRUTIVO = /\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT|RENAME|ALTER COLUMN|REFERENCES)\b/i;

function recusar(stmt: string): never {
  throw new Error(`Statement não aditivo/idempotente recusado: ${stmt.slice(0, 120)}`);
}

/** Aceita só o que está na lista fechada (tabelas novas, seus índices e as colunas anuláveis). */
export function exigirAditivoComplementos(stmt: string): string {
  if (RE_DESTRUTIVO.test(stmt)) recusar(stmt);
  const coluna = RE_ADD_COLUMN.exec(stmt);
  if (coluna) {
    if (COLUNAS_NOVAS[coluna[1]]?.includes(coluna[2])) return stmt;
    recusar(stmt);
  }
  const tabela = RE_CREATE_TABLE.exec(stmt) ?? RE_CREATE_INDEX.exec(stmt);
  if (tabela && (TABELAS_NOVAS as readonly string[]).includes(tabela[1])) return stmt;
  return recusar(stmt);
}

/** Divide o SQL e recusa (lança) qualquer statement que não seja aditivo e idempotente. */
export function statementsAditivosComplementos(conteudo: string): string[] {
  return dividirStatementsComBlocos(conteudo).map(exigirAditivoComplementos);
}

export function lerStatementsComplementos(): { conteudo: string; statements: string[] } {
  const conteudo = readFileSync(MIGRATION_FILE, 'utf8');
  return { conteudo, statements: statementsAditivosComplementos(conteudo) };
}

/** Cliente mínimo usado pela aplicação (PrismaClient real ou dublê nos testes). */
export interface ClienteMigration {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<unknown>;
  $queryRawUnsafe<T>(sql: string, ...valores: unknown[]): Promise<T>;
}

/**
 * Executa os statements e registra a migration em _prisma_migrations só se ausente. Idempotente:
 * a 2ª execução roda os mesmos statements (todos IF NOT EXISTS) e não registra de novo.
 */
export async function aplicarComplementos(
  cliente: ClienteMigration,
  { conteudo, statements }: { conteudo: string; statements: string[] },
): Promise<{ executados: number; registrada: boolean }> {
  const checksum = createHash('sha256').update(conteudo).digest('hex');
  for (const s of statements) await cliente.$executeRawUnsafe(s);
  const existente = await cliente.$queryRawUnsafe<Array<{ count: bigint | number }>>(
    `SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "migration_name" = $1;`,
    MIGRATION_NAME,
  );
  if (Number(existente[0]?.count ?? 0) > 0)
    return { executados: statements.length, registrada: false };
  await cliente.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" (
       "id", "checksum", "finished_at", "migration_name", "logs",
       "rolled_back_at", "started_at", "applied_steps_count"
     ) VALUES (gen_random_uuid()::text, $1, NOW(), $2, NULL, NULL, NOW(), 1);`,
    checksum,
    MIGRATION_NAME,
  );
  return { executados: statements.length, registrada: true };
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const lido = lerStatementsComplementos();
  const checksum = createHash('sha256').update(lido.conteudo).digest('hex');

  console.log(`=== ${MIGRATION_NAME} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log(`checksum ${checksum} · ${lido.statements.length} statements`);
  for (const s of lido.statements) console.log(`  ${s.split('\n')[0]}`);

  if (!aplicar) {
    console.log('\nDry-run: nada executado. Use --apply para executar.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const r = await aplicarComplementos(prisma, lido);
    console.log(`  ✓ ${r.executados} statements executados`);
    console.log(r.registrada ? '  ✓ registrada em _prisma_migrations' : '  ✓ já registrada');
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
