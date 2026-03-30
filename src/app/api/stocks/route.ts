import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async (request: NextRequest) => {
  // Verificar autenticação
  requireAuth(request);

  // Buscar todos os ativos ativos
  const stocks = await prisma.stock.findMany({
    where: { isActive: true },
    orderBy: { ticker: 'asc' },
  });

  return NextResponse.json(stocks);
});
