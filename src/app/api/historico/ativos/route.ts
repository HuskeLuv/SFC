import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { SECOES_ORDEM } from '@/lib/carteiraCategoryColors';
import { getCategoriaFromPortfolio } from '@/lib/portfolioCategoria';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const fixedIncomeAssetsList = await prisma.fixedIncomeAsset.findMany({
    where: { userId: targetUserId },
  });
  const fixedIncomeAssetIds = new Set(fixedIncomeAssetsList.map((f) => f.assetId));
  const fixedIncomeByAssetId = new Map(fixedIncomeAssetsList.map((f) => [f.assetId, f]));

  const portfolio = await prisma.portfolio.findMany({
    where: { userId: targetUserId },
    include: { stock: true, asset: true },
  });

  const symbols = portfolio
    .map((item) => item.asset?.symbol || item.stock?.ticker)
    .filter(
      (s): s is string =>
        typeof s === 'string' &&
        !s.startsWith('RESERVA-') &&
        !s.startsWith('PERSONALIZADO') &&
        !s.startsWith('RENDA-FIXA') &&
        !s.startsWith('CONTA-CORRENTE'),
    );

  const quotes = await getAssetPrices(
    [...new Set(symbols)].filter((s) => /^[A-Za-z]/.test(s)),
    { useBrapiFallback: true },
  );

  const lastTransactionByPortfolio = new Map<string, Date>();
  const transactions = await prisma.stockTransaction.findMany({
    where: { userId: targetUserId },
    select: { assetId: true, stockId: true, date: true },
    orderBy: { date: 'desc' },
  });

  // Index transactions by assetId and stockId so the per-portfolio lookup
  // below is O(1) instead of O(transactions). Since `transactions` is sorted
  // by date desc, the FIRST occurrence per key is the most recent — preserve
  // that semantic by only setting the map entry when it's still empty.
  const lastTxByAssetId = new Map<string, Date>();
  const lastTxByStockId = new Map<string, Date>();
  for (const tx of transactions) {
    if (tx.assetId && !lastTxByAssetId.has(tx.assetId)) {
      lastTxByAssetId.set(tx.assetId, tx.date);
    }
    if (tx.stockId && !lastTxByStockId.has(tx.stockId)) {
      lastTxByStockId.set(tx.stockId, tx.date);
    }
  }

  portfolio.forEach((p) => {
    // Match the original `find` order: assetId match wins over stockId match.
    const lastTxDate =
      (p.assetId ? lastTxByAssetId.get(p.assetId) : undefined) ??
      (p.stockId ? lastTxByStockId.get(p.stockId) : undefined);
    if (lastTxDate) {
      lastTransactionByPortfolio.set(p.id, lastTxDate);
    }
  });

  const ativosPorCategoria: Record<
    string,
    Array<{
      assetId: string;
      portfolioId: string;
      symbol: string;
      nome: string;
      categoria: string;
      valorAtual: number;
      dataUltimaModificacao: Date | null;
    }>
  > = {};

  for (const item of portfolio) {
    const categoria = getCategoriaFromPortfolio(item, fixedIncomeAssetIds);
    if (!categoria) continue;

    const symbol = item.asset?.symbol || item.stock?.ticker || '';
    const nome = item.asset?.name || item.stock?.companyName || symbol;

    let valorAtual = 0;
    const isFixedIncome = item.assetId ? fixedIncomeAssetIds.has(item.assetId) : false;

    if (isFixedIncome) {
      const fixedIncome = item.assetId ? fixedIncomeByAssetId.get(item.assetId) : null;
      if (fixedIncome) {
        const valorEditado =
          item.avgPrice > 0 && item.quantity > 0 ? item.avgPrice * item.quantity : 0;
        if (valorEditado > 0) {
          valorAtual = valorEditado;
        } else {
          const start = new Date(fixedIncome.startDate);
          const maturity = new Date(fixedIncome.maturityDate);
          const current = new Date();
          const endDate = current > maturity ? maturity : current;
          if (endDate > start) {
            const days = Math.floor((endDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
            valorAtual =
              fixedIncome.investedAmount * Math.pow(1 + fixedIncome.annualRate / 100, days / 365);
          } else {
            valorAtual = fixedIncome.investedAmount;
          }
          valorAtual = Math.round(valorAtual * 100) / 100;
        }
      }
    } else if (item.asset?.type === 'imovel' || item.asset?.type === 'personalizado') {
      valorAtual = item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
    } else {
      const currentPrice = quotes.get(symbol);
      valorAtual = currentPrice ? item.quantity * currentPrice : item.quantity * item.avgPrice;
    }

    const dataUltimaModificacao = lastTransactionByPortfolio.get(item.id) ?? item.lastUpdate;

    const assetId = item.assetId || `stock-${item.stockId}`;

    if (!ativosPorCategoria[categoria]) {
      ativosPorCategoria[categoria] = [];
    }
    ativosPorCategoria[categoria].push({
      assetId,
      portfolioId: item.id,
      symbol,
      nome,
      categoria,
      valorAtual,
      dataUltimaModificacao,
    });
  }

  const secoes = SECOES_ORDEM.filter((c) => ativosPorCategoria[c]?.length).map((categoria) => ({
    categoria,
    ativos: ativosPorCategoria[categoria],
  }));

  return NextResponse.json({ secoes });
});
