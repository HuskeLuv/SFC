/**
 * Re-busca o histórico COMPLETO de dividendos da BRAPI (chave paga) pra todo o
 * catálogo RV e faz upsert — preenche buracos antigos que o `getDividends`
 * banco-primeiro nunca re-buscava (ex.: KFOF11 com 39 dividendos 2018-2021
 * faltando). A BRAPI vira a fonte canônica: remove dividendos YAHOO redundantes
 * no range coberto (ver refreshDividendsFromBrapi). Idempotente.
 *
 * Uso:
 *   tsx --env-file=.env scripts/refresh-dividends-brapi.ts                 # DRY-RUN (só conta)
 *   tsx --env-file=.env scripts/refresh-dividends-brapi.ts --apply
 *   tsx --env-file=.env scripts/refresh-dividends-brapi.ts --apply --symbols=KFOF11
 *   tsx --env-file=.env scripts/refresh-dividends-brapi.ts --apply --types=fii,etf
 */
import { prisma } from '@/lib/prisma';
import { refreshDividendsFromBrapi } from '@/services/pricing/dividendService';

const RV_TYPES = ['stock', 'fii', 'etf', 'reit', 'fim-fia', 'bdr'];
const arg = (n: string) =>
  process.argv
    .find((a) => a.startsWith(`--${n}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const has = (n: string) => process.argv.includes(`--${n}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = has('apply');
  const throttle = Number(arg('throttle') ?? 200);
  const only = arg('symbols')
    ?.split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const types =
    arg('types')
      ?.split(',')
      .map((s) => s.trim()) ?? RV_TYPES;

  const assets = await prisma.asset.findMany({
    where: { type: { in: types }, ...(only ? { symbol: { in: only } } : {}) },
    select: { symbol: true },
    distinct: ['symbol'],
    orderBy: { symbol: 'asc' },
  });

  console.log(
    `\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'} — refresh de dividendos BRAPI: ${assets.length} símbolo(s)\n`,
  );
  if (!apply) {
    console.log('(dry-run — rode com --apply pra re-buscar e gravar)\n');
    return;
  }

  let comDiv = 0;
  let totalDiv = 0;
  const semBrapi: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const sym = assets[i].symbol;
    const before = await prisma.assetDividendHistory.count({ where: { symbol: sym } });
    let n = 0;
    try {
      n = await refreshDividendsFromBrapi(sym);
    } catch (e) {
      console.log(`  ✗ ${sym}: ${e instanceof Error ? e.message : e}`);
    }
    const after = await prisma.assetDividendHistory.count({ where: { symbol: sym } });
    const delta = after - before;
    if (n > 0) {
      comDiv++;
      totalDiv += n;
    } else {
      semBrapi.push(sym);
    }
    if (delta !== 0 || only) {
      console.log(
        `  [${i + 1}/${assets.length}] ${sym.padEnd(10)} BRAPI=${n} | banco ${before}→${after} (${delta >= 0 ? '+' : ''}${delta})`,
      );
    }
    if (i < assets.length - 1 && throttle > 0) await sleep(throttle);
  }

  console.log(`\n================ RESUMO ================`);
  console.log(`Símbolos cobertos pela BRAPI: ${comDiv}`);
  console.log(`Total de dividendos (BRAPI):  ${totalDiv}`);
  console.log(`Sem dividendo na BRAPI:        ${semBrapi.length}`);
  console.log(`=======================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
