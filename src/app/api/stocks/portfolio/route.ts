import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

// GET - Buscar portfolio do usuário
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const portfolio = await prisma.portfolio.findMany({
    where: { userId: user.id },
    include: {
      stock: true,
    },
    orderBy: { lastUpdate: 'desc' },
  });

  return NextResponse.json(portfolio);
});
