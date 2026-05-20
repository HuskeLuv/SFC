import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDividends } from '@/services/pricing/dividendService';
import { ensurePortfolioProventosFromMarket } from '@/lib/ensurePortfolioProventosFromMarket';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron diário: sincroniza dividendos novos da BRAPI para PortfolioProvento.
 *
 * Endereça o gap arquitetural em [[proventos-sync-gaps]]: `dividendService`
 * usa o DB como cache permanente. Sem refresh periódico, proventos novos
 * catalogados após a primeira sync nunca chegam.
 *
 * Para cada symbol ativo (com Portfolio):
 *   1. Deleta AssetDividendHistory daquele symbol e força re-fetch BRAPI
 *      (dedup pré-upsert soma duplicates por (date, tipo)).
 *   2. Pra cada Portfolio com o symbol, chama ensurePortfolioProventosFromMarket
 *      em mode='sync' — pula guard externo, depende do dup-check pra evitar
 *      duplicar (inclui dismissed pra respeitar deletes do usuário).
 *
 * Idempotente. Vercel limit: 60s. Pra carteiras maiores, considerar
 * paginação por symbol/batch.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const assets = await prisma.asset.findMany({
    where: { type: { in: ['stock', 'fii', 'etf', 'reit', 'fim-fia'] } },
    select: { symbol: true },
    distinct: ['symbol'],
  });

  let symbolsProcessed = 0;
  let totalCreated = 0;
  const errors: Array<{ symbol: string; error: string }> = [];

  for (const { symbol } of assets) {
    try {
      await prisma.assetDividendHistory.deleteMany({ where: { symbol } });
      const dividends = await getDividends(symbol, { useBrapiFallback: true });
      if (dividends.length === 0) {
        symbolsProcessed += 1;
        continue;
      }

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
        totalCreated += after - before;
      }
      symbolsProcessed += 1;
    } catch (err) {
      errors.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    symbolsProcessed,
    totalCreated,
    errors,
  });
});
