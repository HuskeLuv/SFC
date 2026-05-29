import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { invalidatePortfolioSnapshots } from '@/services/portfolio/portfolioRecalculation';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const DELETE = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
    });

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfólio não encontrado' }, { status: 404 });
    }

    if (!portfolio.assetId) {
      return NextResponse.json({ error: 'Investimento sem vínculo de ativo' }, { status: 400 });
    }

    // Data da primeira transação do ativo: cutoff para invalidar a série
    // histórica. Sem isso, os snapshots diários (portfolio_daily_snapshots /
    // portfolio_performance) persistidos continuam carregando a contribuição
    // do ativo excluído e ele segue aparecendo nos gráficos mesmo após sumir
    // da carteira. Invalidar a partir da 1ª compra força o rebuild ao vivo,
    // que filtra transações sem asset, até o cron diário repovoar a tabela.
    const firstTransaction = await prisma.stockTransaction.findFirst({
      where: { userId: targetUserId, assetId: portfolio.assetId },
      orderBy: { date: 'asc' },
      select: { date: true },
    });

    await prisma.stockTransaction.deleteMany({
      where: { userId: targetUserId, assetId: portfolio.assetId },
    });
    await prisma.portfolio.delete({ where: { id: portfolioId } });

    if (firstTransaction) {
      await invalidatePortfolioSnapshots(targetUserId, firstTransaction.date);
    }

    return NextResponse.json({ success: true });
  },
);
