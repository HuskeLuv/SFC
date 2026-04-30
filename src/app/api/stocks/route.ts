import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (request: NextRequest) => {
  // Verificar autenticação
  requireAuth(request);

  // Buscar todos os ativos ativos. Defensive ceiling: the active stock
  // universe is well under 1000 tickers; cap to avoid an unbounded payload
  // if data drifts or the filter misbehaves.
  const stocks = await prisma.stock.findMany({
    where: { isActive: true },
    orderBy: { ticker: 'asc' },
    take: 1000,
  });

  return NextResponse.json(stocks);
});
