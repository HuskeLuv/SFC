/**
 * Backfill de dividendos antigos via Yahoo Finance.
 *
 * FALLBACK do Yahoo: a fonte PRINCIPAL de dividendos é a BRAPI (chave paga →
 * histórico completo via `refreshDividendsFromBrapi`). Este script só preenche
 * símbolos que a BRAPI NÃO cobre. O Yahoo tem o histórico (mas split-ADJUSTED) —
 * `syncYahooDividends` des-ajusta pra cru e preenche só o GAP anterior ao
 * dividendo mais antigo já no banco. Ver [[project_brapi_paid]].
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-yahoo-dividends.ts                 # DRY-RUN
 *   npx tsx --env-file=.env scripts/backfill-yahoo-dividends.ts --apply
 *   npx tsx --env-file=.env scripts/backfill-yahoo-dividends.ts --symbols=HFOF11 --apply
 *
 * Idempotente (upsert keep-existing). Throttle anti-429.
 */
import { prisma } from '@/lib/prisma';
import { fetchYahooDividends, syncYahooDividends } from '@/services/pricing/yahooCorporateActions';

const TYPES = ['acao', 'stock', 'fii', 'etf', 'reit', 'fim-fia', 'bdr'];
const THROTTLE_MS = 300;
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
  const only = arg('symbols')
    ?.split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const types =
    arg('types')
      ?.split(',')
      .map((s) => s.trim()) ?? TYPES;

  const assets = await prisma.asset.findMany({
    where: { type: { in: types }, ...(only ? { symbol: { in: only } } : {}) },
    select: { symbol: true },
    distinct: ['symbol'],
    orderBy: { symbol: 'asc' },
  });
  console.log(`\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'} — ${assets.length} símbolos\n`);

  let filled = 0;
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const { symbol } = assets[i];
    try {
      if (apply) {
        const n = await syncYahooDividends(symbol);
        if (n > 0) {
          filled++;
          inserted += n;
          console.log(`  [${i + 1}/${assets.length}] ${symbol}: +${n} dividendos preenchidos`);
        }
      } else {
        // dry-run: só reporta quantos o Yahoo tem antes do mais antigo do banco
        const divs = await fetchYahooDividends(symbol);
        const earliest = await prisma.assetDividendHistory.findFirst({
          where: { symbol },
          orderBy: { date: 'asc' },
          select: { date: true },
        });
        const cut = earliest?.date.getTime() ?? Infinity;
        const gap = divs.filter((d) => d.date.getTime() < cut).length;
        if (gap > 0) {
          filled++;
          console.log(`  [${i + 1}/${assets.length}] ${symbol}: ${gap} dividendos no gap (Yahoo)`);
        }
      }
    } catch (err) {
      errors.push(`${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(THROTTLE_MS);
  }

  console.log(`\n================ RESUMO ================`);
  console.log(`Símbolos com gap preenchido: ${filled}`);
  if (apply) console.log(`Dividendos inseridos:        ${inserted}`);
  console.log(`Erros:                       ${errors.length}`);
  errors.slice(0, 15).forEach((e) => console.log(`  ✗ ${e}`));
  if (!apply) console.log(`\n(dry-run — rode com --apply pra gravar)`);
  console.log(`=======================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  });
