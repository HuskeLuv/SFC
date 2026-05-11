import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
      include: { asset: true },
    });

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfólio não encontrado' }, { status: 404 });
    }

    const transactions = portfolio.assetId
      ? await prisma.stockTransaction.findMany({
          where: { userId: targetUserId, assetId: portfolio.assetId },
          orderBy: { date: 'desc' },
        })
      : [];

    const tipoOperacaoMap: Record<string, string> = {
      compra: 'Aporte',
      venda: 'Resgate',
    };

    const historico = transactions.map((tx) => ({
      id: tx.id,
      tipoOperacao: tipoOperacaoMap[tx.type] || tx.type,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      date: tx.date,
      fees: tx.fees,
      notes: tx.notes,
    }));

    return NextResponse.json({
      portfolio: {
        id: portfolio.id,
        symbol: portfolio.asset?.symbol,
        nome: portfolio.asset?.name,
        quantity: portfolio.quantity,
        avgPrice: portfolio.avgPrice,
        totalInvested: portfolio.totalInvested,
      },
      historico,
    });
  },
);
