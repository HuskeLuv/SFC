import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { apurarStocksUs, type UsTransaction } from '@/services/ir/stocksUsIR';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Apuração mensal de IR sobre ganho de capital em moeda estrangeira.
 *
 * Cobre Stocks US e REITs US: lê StockTransaction onde o asset é do tipo
 * 'stock' ou 'reit' e o `notes.operation` carrega a cotação do dólar
 * (cotacaoMoeda) usada na operação. BDRs (negociadas em BRL na B3) seguem
 * regras de renda variável BR e não são incluídas aqui.
 */

interface StoredOperation {
  moeda?: string | null;
  cotacaoMoeda?: number | null;
}

function parseCotacaoMoeda(notes: string | null): number | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { operation?: StoredOperation };
    const op = parsed.operation;
    if (!op) return null;
    if (op.moeda && op.moeda.toUpperCase() !== 'USD') return null;
    const fx = op.cotacaoMoeda;
    return fx && Number.isFinite(fx) && fx > 0 ? fx : null;
  } catch {
    return null;
  }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const transactions = await prisma.stockTransaction.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
    orderBy: { date: 'asc' },
  });

  const usTransactions: UsTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const assetType = tx.asset?.type;
    // Apenas Stocks US e REITs US — Asset.type === 'stock' ou 'reit'.
    if (assetType !== 'stock' && assetType !== 'reit') continue;
    const fxRate = parseCotacaoMoeda(tx.notes);
    if (!fxRate) continue;

    usTransactions.push({
      date: tx.date,
      type: tx.type,
      symbol: tx.asset?.symbol || 'UNKNOWN',
      quantity: tx.quantity,
      priceUsd: Number(tx.price),
      fxRate,
      feesBrl: tx.fees ? Number(tx.fees) : 0,
    });
  }

  const apuracao = apurarStocksUs(usTransactions);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
  });
});
