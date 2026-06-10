import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensurePortfolioProventosFromMarket } from '@/lib/ensurePortfolioProventosFromMarket';
import { CORPORATE_ACTION_NOTE_MARKER } from '@/services/portfolio/corporateActions';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron diário: MATERIALIZA `PortfolioProvento` (camada de override/exibição) a
 * partir do histórico de dividendos JÁ no banco — que é mantido fresco pelo cron
 * `market-data/refresh`. Banco-only: NÃO busca fonte externa nem deleta+refetch
 * (o padrão destrutivo antigo saiu). A SÉRIE de rentabilidade não depende disto
 * (lê do histórico global via `resolveProventos`); a materialização serve aos
 * overrides do usuário e à exibição no editor.
 *
 * Idempotente (dup-check em ensurePortfolioProventosFromMarket, respeita dismissed).
 * Itera só posições detidas (Portfolio), não o catálogo inteiro.
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

  const portfolios = await prisma.portfolio.findMany({
    where: { asset: { type: { in: ['stock', 'fii', 'etf', 'reit', 'fim-fia'] } } },
    select: {
      id: true,
      userId: true,
      assetId: true,
      quantity: true,
      lastUpdate: true,
      asset: { select: { symbol: true } },
    },
  });

  let portfoliosProcessed = 0;
  let totalCreated = 0;
  const errors: Array<{ symbol: string; error: string }> = [];

  for (const p of portfolios) {
    const symbol = p.asset?.symbol;
    if (!symbol) continue;
    try {
      const transactions = p.assetId
        ? await prisma.stockTransaction.findMany({
            where: {
              userId: p.userId,
              assetId: p.assetId,
              type: { in: ['compra', 'venda'] },
              // Exclui linhas de auditoria de evento corporativo — a timeline de
              // proventos aplica o fator, não o delta congelado.
              NOT: { notes: { contains: CORPORATE_ACTION_NOTE_MARKER } },
            },
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
      portfoliosProcessed += 1;
    } catch (err) {
      errors.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ portfoliosProcessed, totalCreated, errors });
});
