/**
 * Aplica a migration do bloco D da Análise de Ativos ("Meus cenários": tabela analise_cenarios) no
 * banco de DEV (Neon) sem `prisma migrate dev` — o dev tem drift e o migrate dev propõe reset
 * (memória project_prisma_schema_drift). Molde: apply-migration-bloco-c.ts.
 *
 * O migration.sql commitado JÁ é idempotente: CREATE TABLE/INDEX IF NOT EXISTS e a FK para "User"
 * num bloco `DO $$ BEGIN ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY …; EXCEPTION WHEN
 * duplicate_object THEN NULL; END $$` (o mesmo arquivo serve ao `prisma migrate deploy` do CI e da
 * produção). Cada statement é executado como está e a migration é registrada em _prisma_migrations
 * (checksum = sha256 do arquivo, igual ao do Prisma) só se ausente. Rodar 2× não muda nada.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-bloco-d.ts           # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/apply-migration-bloco-d.ts --apply   # executa
 *
 * Recusa qualquer statement que não seja CREATE TABLE IF NOT EXISTS, CREATE [UNIQUE] INDEX IF NOT
 * EXISTS ou o bloco DO $$ de FK com EXCEPTION WHEN duplicate_object. Depois: npx prisma generate.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { exigirAditivoIdempotente } from './apply-migration-fase1';

export const MIGRATION_NAME = '20261014000000_analise_ativos_bloco_d';
export const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);

/**
 * Divide o SQL em statements respeitando blocos dollar-quoted ($$ … $$): o `;` dentro do DO não
 * separa. Linhas de comentário (--) fora de bloco são descartadas.
 */
export function dividirStatementsComBlocos(sql: string): string[] {
  const statements: string[] = [];
  let atual: string[] = [];
  let dentroDeBloco = false;
  for (const linha of sql.split(/\r?\n/)) {
    if (!dentroDeBloco && linha.trim().startsWith('--')) continue;
    atual.push(linha);
    const marcadores = (linha.match(/\$\$/g) ?? []).length;
    if (marcadores % 2 === 1) dentroDeBloco = !dentroDeBloco;
    if (!dentroDeBloco && /;\s*$/.test(linha)) {
      const stmt = atual.join('\n').trim().replace(/;\s*$/, '').trim();
      if (stmt.length > 0) statements.push(stmt);
      atual = [];
    }
  }
  const resto = atual.join('\n').trim();
  if (resto.length > 0) statements.push(resto.replace(/;\s*$/, '').trim());
  return statements;
}

const RE_DO_FK =
  /^DO \$\$ BEGIN\s+ALTER TABLE "[a-z_]+" ADD CONSTRAINT "[A-Za-z_]+" FOREIGN KEY \("[A-Za-z]+"\) REFERENCES "[A-Za-z_]+"\("[A-Za-z]+"\)[A-Z ]*;\s+EXCEPTION WHEN duplicate_object THEN NULL;\s+END \$\$$/;

/** Aceita CREATE TABLE/INDEX IF NOT EXISTS e o bloco DO de FK idempotente; lança para o resto. */
export function exigirAditivoBlocoD(stmt: string): string {
  if (stmt.startsWith('DO $$')) {
    if (RE_DO_FK.test(stmt)) return stmt;
    throw new Error(`Statement não aditivo/idempotente recusado: ${stmt.slice(0, 120)}`);
  }
  return exigirAditivoIdempotente(stmt);
}

/** Divide o SQL e recusa (lança) qualquer statement que não seja aditivo e idempotente. */
export function statementsAditivosBlocoD(conteudo: string): string[] {
  return dividirStatementsComBlocos(conteudo).map(exigirAditivoBlocoD);
}

export function lerStatementsBlocoD(): { conteudo: string; statements: string[] } {
  const conteudo = readFileSync(MIGRATION_FILE, 'utf8');
  return { conteudo, statements: statementsAditivosBlocoD(conteudo) };
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const { conteudo, statements } = lerStatementsBlocoD();
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

    const fk = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE conname = 'analise_cenarios_userId_fkey';`,
    );
    console.log(`  ✓ FK analise_cenarios_userId_fkey: ${fk.length === 1 ? 'presente' : 'AUSENTE'}`);
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
