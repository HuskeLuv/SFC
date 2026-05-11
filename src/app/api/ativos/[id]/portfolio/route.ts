import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

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

    await prisma.stockTransaction.deleteMany({
      where: { userId: targetUserId, assetId: portfolio.assetId },
    });
    await prisma.portfolio.delete({ where: { id: portfolioId } });

    return NextResponse.json({ success: true });
  },
);
