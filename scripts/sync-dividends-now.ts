/**
 * Invoca a mesma lógica do cron `/api/cron/brapi-sync/dividends` em ambiente local.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/sync-dividends-now.ts          # todos symbols
 *   npx tsx --env-file=.env scripts/sync-dividends-now.ts BBAS3    # 1 symbol
 *
 * Útil para:
 *   - catch-up imediato pós-deploy (não esperar cron diário)
 *   - debugar caso de symbol específico (BBAS3 RENDIMENTO 2026-03-05 etc.)
 *
 * Comportamento idêntico ao cron: re-fetch BRAPI + sync com `mode='sync'` —
 * idempotente, respeita `dismissed`.
 */
import prisma from '@/lib/prisma';
import { getDividends } from '@/services/pricing/dividendService';
import { ensurePortfolioProventosFromMarket } from '@/lib/ensurePortfolioProventosFromMarket';

async function main() {
  const onlySymbol = process.argv[2]?.toUpperCase();

  const where = onlySymbol
    ? { type: { in: ['stock', 'fii', 'etf', 'reit', 'fim-fia'] }, symbol: onlySymbol }
    : { type: { in: ['stock', 'fii', 'etf', 'reit', 'fim-fia'] } };

  const assets = await prisma.asset.findMany({
    where,
    select: { symbol: true },
    distinct: ['symbol'],
  });

  console.log(`📊 Sincronizando dividendos: ${assets.length} símbolo(s)\n`);

  let totalCreated = 0;
  let errors = 0;

  for (const { symbol } of assets) {
    try {
      await prisma.assetDividendHistory.deleteMany({ where: { symbol } });
      const dividends = await getDividends(symbol, { useBrapiFallback: true });
      if (dividends.length === 0) continue;

      const portfolios = await prisma.portfolio.findMany({
        where: { asset: { symbol } },
      });

      for (const p of portfolios) {
        const transactions = p.assetId
          ? await prisma.stockTransaction.findMany({
              where: { userId: p.userId, assetId: p.assetId, type: { in: ['compra', 'venda'] } },
              select: { date: true, quantity: true, type: true },
            })
          : [];

        const before = await prisma.portfolioProvento.count({
          where: { portfolioId: p.id, userId: p.userId },
        });

        await ensurePortfolioProventosFromMarket({
          portfolioId: p.id,
          userId: p.userId,
          ticker: symbol,
          transactions,
          portfolioQuantity: p.quantity,
          portfolioLastUpdate: p.lastUpdate,
          mode: 'sync',
        });

        const after = await prisma.portfolioProvento.count({
          where: { portfolioId: p.id, userId: p.userId },
        });
        const created = after - before;
        if (created > 0) {
          console.log(`  ✓ ${symbol} portfolio ${p.id.slice(0, 8)} — +${created} provento(s)`);
          totalCreated += created;
        }
      }
    } catch (err) {
      errors += 1;
      console.warn(`  ⚠️  ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nResumo:`);
  console.log(`  Símbolos:        ${assets.length}`);
  console.log(`  Proventos novos: ${totalCreated}`);
  console.log(`  Erros:           ${errors}`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export default main;
