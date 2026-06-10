/**
 * Backfill COMPLETO de dados de mercado (dividendos + eventos corporativos) pra
 * TODO o catálogo de renda variável (`Asset`), materializando tudo na nossa base.
 *
 * Objetivo: tirar o runtime da dependência de sync externo. Depois deste backfill
 * (+ os crons de refresh), `asset_dividend_history` e `asset_corporate_actions`
 * cobrem o catálogo inteiro e o runtime lê SÓ do banco. Cada símbolo recebe um
 * registro em `MarketDataCoverage` (OK / EMPTY / FETCH_FAIL) que serve de status
 * e de CHECKPOINT pra resumir após interrupção (queda de energia, 429, etc.).
 *
 * Por símbolo, na ordem certa (split antes de dividendo Yahoo): BRAPI (dividendos
 * recentes + bonificações) → Yahoo splits → Yahoo dividendos antigos. Idempotente
 * (upserts) e best-effort.
 *
 * Uso:
 *   tsx --env-file=.env scripts/backfill-market-data.ts                  # DRY-RUN (só conta)
 *   tsx --env-file=.env scripts/backfill-market-data.ts --apply          # grava
 *   tsx --env-file=.env scripts/backfill-market-data.ts --apply --types=fii,etf
 *   tsx --env-file=.env scripts/backfill-market-data.ts --apply --batch=300 --offset=0
 *   tsx --env-file=.env scripts/backfill-market-data.ts --apply --symbols=MXRF11,HGLG11
 *   tsx --env-file=.env scripts/backfill-market-data.ts --apply --force      # ignora checkpoint
 *
 * Flags:
 *   --apply              grava (default: dry-run)
 *   --types=a,b          tipos de ativo (default: os 7 RV)
 *   --symbols=A,B        subconjunto explícito
 *   --batch=N            processa no máximo N símbolos nesta execução
 *   --offset=N           pula os primeiros N (paginação manual)
 *   --max-age=H          pula símbolos já OK/EMPTY checados há < H horas (default 24)
 *   --force              ignora o checkpoint (reprocessa tudo)
 *   --throttle=MS        ms entre símbolos (default 300)
 *
 * Aponte DATABASE_URL pro banco-alvo (dev/Neon ou prod/RDS).
 */
import { prisma } from '@/lib/prisma';
import { backfillSymbolMarketData } from '@/services/pricing/marketDataBackfill';

const RV_TYPES = ['stock', 'fii', 'etf', 'reit', 'fim-fia', 'bdr'];

const arg = (name: string): string | undefined =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const has = (name: string): boolean => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = has('apply');
  const force = has('force');
  const throttleMs = Number(arg('throttle') ?? 300);
  const maxAgeH = Number(arg('max-age') ?? 24);
  const maxAgeMs = maxAgeH * 60 * 60 * 1000;
  const batch = arg('batch') ? Number(arg('batch')) : Infinity;
  const offset = Number(arg('offset') ?? 0);
  const onlySymbols = arg('symbols')
    ?.split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const types =
    arg('types')
      ?.split(',')
      .map((s) => s.trim()) ?? RV_TYPES;

  const assets = await prisma.asset.findMany({
    where: { type: { in: types }, ...(onlySymbols ? { symbol: { in: onlySymbols } } : {}) },
    select: { symbol: true },
    distinct: ['symbol'],
    orderBy: { symbol: 'asc' },
  });

  // Checkpoint: pula símbolos já resolvidos (OK/EMPTY) e checados recentemente.
  const coverage = await prisma.marketDataCoverage.findMany({
    select: { symbol: true, status: true, lastCheckedAt: true },
  });
  const covBySym = new Map(coverage.map((c) => [c.symbol, c]));
  const cutoff = Date.now() - maxAgeMs;
  const isFresh = (symbol: string): boolean => {
    if (force) return false;
    const c = covBySym.get(symbol);
    return (
      !!c &&
      (c.status === 'OK' || c.status === 'EMPTY') &&
      !!c.lastCheckedAt &&
      c.lastCheckedAt.getTime() > cutoff
    );
  };

  const pending = assets.map((a) => a.symbol).filter((s) => !isFresh(s));
  const skipped = assets.length - pending.length;
  const slice = pending.slice(offset, batch === Infinity ? undefined : offset + batch);

  console.log(
    `\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'} — catálogo: ${assets.length} símbolo(s) [${types.join(',')}]`,
  );
  console.log(
    `Checkpoint: ${skipped} já cobertos (< ${maxAgeH}h) | ${pending.length} pendentes | processando ${slice.length} nesta run\n`,
  );

  if (!apply) {
    console.log('(dry-run — rode com --apply pra gravar)\n');
    return;
  }

  const counts = { OK: 0, EMPTY: 0, FETCH_FAIL: 0 } as Record<string, number>;
  const failed: string[] = [];

  for (let i = 0; i < slice.length; i++) {
    const symbol = slice[i];
    const r = await backfillSymbolMarketData(symbol);
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (r.status === 'FETCH_FAIL') failed.push(`${symbol}: ${r.error ?? '?'}`);
    const tag = r.status === 'OK' ? '✓' : r.status === 'EMPTY' ? '·' : '✗';
    console.log(
      `  [${i + 1}/${slice.length}] ${tag} ${symbol.padEnd(10)} ${r.status.padEnd(10)} (+${r.dividendCount} div, +${r.caCount} ca)`,
    );
    if (i < slice.length - 1 && throttleMs > 0) await sleep(throttleMs);
  }

  console.log(`\n================ RESUMO ================`);
  console.log(`OK (com dados):       ${counts.OK}`);
  console.log(`EMPTY (sem provento): ${counts.EMPTY}`);
  console.log(`FETCH_FAIL (retry):   ${counts.FETCH_FAIL}`);
  failed.slice(0, 25).forEach((e) => console.log(`  ✗ ${e}`));
  if (counts.FETCH_FAIL > 0)
    console.log(`\n↻ Re-rode o script (resume automático) pra tentar os FETCH_FAIL de novo.`);
  console.log(`=======================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
