/**
 * Auditoria de cobertura de proventos (asset_dividend_history).
 *
 * Verifica, para os símbolos de renda variável detidos no banco, se o histórico
 * global de dividendos cobre o período desde a primeira compra de cada usuário —
 * pré-requisito para a série de rentabilidade (TWR retorno-total) ficar correta.
 * Um símbolo "SEM DIVIDENDOS" ou "COMEÇA TARDE" indica buraco de FONTE de dados
 * (BRAPI/Yahoo incompletos), independente do pipeline de cálculo.
 *
 * Uso:
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/audit-proventos-coverage.ts
 *   # opcional: auditar símbolos específicos (ex.: os que o usuário de teste usou)
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/audit-proventos-coverage.ts MXRF11 HGLG11 PETR4
 *
 * Aponte DATABASE_URL para o banco que quer auditar (dev/Neon ou prod/RDS).
 * É READ-ONLY: nenhuma escrita.
 */
import { prisma } from '@/lib/prisma';

const RV_TYPES = ['stock', 'fii', 'etf', 'reit', 'fim-fia', 'bdr'];
const DAY_MS = 86_400_000;
// FIIs distribuem mensalmente; ações trimestral/semestral. 120d cobre ambos.
const LATE_START_THRESHOLD_MS = 120 * DAY_MS;

const fmt = (date: Date | null): string => (date ? date.toISOString().slice(0, 10) : '   -   ');
const isFii = (symbol: string): boolean => /11B?$/.test(symbol);

async function main(): Promise<void> {
  const filterSymbols = process.argv.slice(2).map((s) => s.toUpperCase());

  // Primeira compra por símbolo (entre todos os usuários).
  const txs = await prisma.stockTransaction.findMany({
    where: { type: 'compra', asset: { type: { in: RV_TYPES } } },
    select: { date: true, asset: { select: { symbol: true, type: true } } },
  });

  const bySymbol = new Map<string, { firstBuy: Date; type: string }>();
  for (const t of txs) {
    const symbol = t.asset?.symbol;
    if (!symbol) continue;
    if (filterSymbols.length > 0 && !filterSymbols.includes(symbol.toUpperCase())) continue;
    const cur = bySymbol.get(symbol);
    if (!cur || t.date < cur.firstBuy) {
      bySymbol.set(symbol, { firstBuy: t.date, type: t.asset!.type });
    }
  }

  // Permite auditar símbolos pedidos mesmo que ninguém os detenha.
  for (const s of filterSymbols) {
    if (!bySymbol.has(s)) bySymbol.set(s, { firstBuy: new Date(0), type: '?' });
  }

  const symbols = [...bySymbol.keys()].sort();
  if (symbols.length === 0) {
    console.log('Nenhum símbolo de RV encontrado para auditar.');
    return;
  }

  console.log(`\n=== Cobertura de proventos — ${symbols.length} símbolo(s) ===\n`);
  console.log(
    'SÍMBOLO     TIPO     1ªCOMPRA    DIV_ROWS  MIN_DIV     MAX_DIV     FONTES        STATUS',
  );
  console.log('-'.repeat(100));

  let holes = 0;
  const holeSymbols: string[] = [];
  for (const symbol of symbols) {
    const info = bySymbol.get(symbol)!;
    const rows = await prisma.assetDividendHistory.findMany({
      where: { symbol },
      select: { date: true, source: true },
      orderBy: { date: 'asc' },
    });
    const n = rows.length;
    const minD = n ? rows[0].date : null;
    const maxD = n ? rows[n - 1].date : null;
    const sources = [...new Set(rows.map((r) => r.source))].join('+') || '-';

    let status = 'ok';
    if (n === 0) {
      status = '*** SEM DIVIDENDOS ***';
      holes++;
      holeSymbols.push(symbol);
    } else if (
      minD &&
      info.firstBuy.getTime() > 0 &&
      minD.getTime() - info.firstBuy.getTime() > LATE_START_THRESHOLD_MS
    ) {
      status = '*** COMEÇA TARDE ***';
      holes++;
      holeSymbols.push(symbol);
    }

    const mark = isFii(symbol) ? '*' : ' ';
    console.log(
      `${mark}${symbol.padEnd(10)} ${info.type.padEnd(8)} ${fmt(info.firstBuy === new Date(0) ? null : info.firstBuy)}  ${String(n).padStart(7)}  ${fmt(minD)}  ${fmt(maxD)}  ${sources.padEnd(12)}  ${status}`,
    );
  }

  console.log('-'.repeat(100));
  console.log(`\n(* = FII/cota — categoria de maior risco de buraco no Yahoo/BRAPI)`);
  console.log(
    `${holes}/${symbols.length} símbolo(s) com buraco de cobertura${holeSymbols.length ? `: ${holeSymbols.join(', ')}` : ''}`,
  );

  const total = await prisma.assetDividendHistory.count();
  const distinct = await prisma.assetDividendHistory.findMany({
    select: { symbol: true },
    distinct: ['symbol'],
  });
  console.log(`\nasset_dividend_history: ${total} linhas, ${distinct.length} símbolos distintos\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
