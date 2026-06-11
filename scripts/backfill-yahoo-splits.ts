/**
 * Backfill de eventos corporativos (splits/grupamentos) via Yahoo Finance.
 *
 * Motivo: o que consumimos da BRAPI (`dividendsData.stockDividends`) traz só
 * bonificações, não splits/grupamentos. Sem isso, desdobramentos (ex.: MXRF11
 * 10:1) não chegavam ao banco e as posições ficavam erradas. O Yahoo expõe esses
 * eventos via `events=split`. Este script pré-popula `AssetCorporateAction`
 * (source=YAHOO) pra TODOS os ativos do catálogo. (Avaliar o módulo `splitHistory`
 * da BRAPI — temos plano pago; ver [[project_brapi_paid]].)
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-yahoo-splits.ts                 # DRY-RUN (não grava)
 *   npx tsx --env-file=.env scripts/backfill-yahoo-splits.ts --apply         # grava os eventos
 *   npx tsx --env-file=.env scripts/backfill-yahoo-splits.ts --apply --reapply  # + recalcula posições afetadas
 *   npx tsx --env-file=.env scripts/backfill-yahoo-splits.ts --symbols=HFOF11 --apply --reapply
 *   npx tsx --env-file=.env scripts/backfill-yahoo-splits.ts --types=fii --apply
 *
 * Idempotente (upsert via [symbol, date, type]). Throttle pra não tomar 429 do Yahoo.
 */
import { prisma } from '@/lib/prisma';
import { fetchYahooSplits, persistYahooSplits } from '@/services/pricing/yahooCorporateActions';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';

const CA_TYPES = ['acao', 'stock', 'fii', 'etf', 'reit', 'fim-fia', 'bdr'];
const THROTTLE_MS = 300;

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
  const reapply = has('reapply');
  const onlySymbols = arg('symbols')
    ?.split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const types =
    arg('types')
      ?.split(',')
      .map((s) => s.trim()) ?? CA_TYPES;

  const assets = await prisma.asset.findMany({
    where: {
      type: { in: types },
      ...(onlySymbols ? { symbol: { in: onlySymbols } } : {}),
    },
    select: { id: true, symbol: true, type: true },
    distinct: ['symbol'],
    orderBy: { symbol: 'asc' },
  });

  console.log(
    `\n${apply ? '🟢 APPLY' : '🟡 DRY-RUN'}${reapply ? ' + REAPPLY' : ''} — ${assets.length} símbolos (${types.join(',')})\n`,
  );

  let withSplits = 0;
  let eventsWritten = 0;
  let positionsRecomputed = 0;
  const errors: string[] = [];

  for (let i = 0; i < assets.length; i++) {
    const { id: assetId, symbol } = assets[i];
    try {
      const splits = await fetchYahooSplits(symbol);
      if (splits.length > 0) {
        withSplits++;
        const desc = splits
          .map((s) => `${s.completeFactor}@${s.date.toISOString().slice(0, 10)}`)
          .join(', ');
        console.log(
          `  [${i + 1}/${assets.length}] ${symbol}: ${splits.length} evento(s) — ${desc}`,
        );
        if (apply) {
          eventsWritten += await persistYahooSplits(symbol, splits);
          if (reapply) {
            const portfolios = await prisma.portfolio.findMany({
              where: { assetId },
              select: { id: true, userId: true },
            });
            for (const p of portfolios) {
              await recalculatePortfolioFromTransactions({
                targetUserId: p.userId,
                assetId,
                portfolioId: p.id,
                recomputeSnapshotsFrom: splits[0].date,
              });
              // Cria a linha de auditoria do evento no extrato (idempotente).
              await applyCorporateActionsToUserPositions(p.userId, { assetId });
              positionsRecomputed++;
            }
            if (portfolios.length)
              console.log(`        ↳ ${portfolios.length} posição(ões) recalculada(s)`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${symbol}: ${msg}`);
    }
    await sleep(THROTTLE_MS);
  }

  console.log(`\n================ RESUMO ================`);
  console.log(`Símbolos com split:   ${withSplits}`);
  if (apply) console.log(`Eventos gravados:     ${eventsWritten}`);
  if (reapply) console.log(`Posições recalc:      ${positionsRecomputed}`);
  console.log(`Erros:                ${errors.length}`);
  errors.slice(0, 20).forEach((e) => console.log(`  ✗ ${e}`));
  if (!apply) console.log(`\n(dry-run — rode com --apply pra gravar)`);
  console.log(`=======================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
