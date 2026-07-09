import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/cashflow/anos
 *
 * Menor ano com dados do usuário no fluxo de caixa — derivado da transação de
 * carteira mais antiga (aportes/resgates) e do menor ano com CashflowValue.
 * Alimenta o seletor de anos da sidebar: um usuário com aportes em 2022
 * precisa ter acesso à planilha de 2022.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const [oldestTransaction, oldestValue] = await Promise.all([
    prisma.stockTransaction.findFirst({
      where: { userId: targetUserId },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    prisma.cashflowValue.findFirst({
      where: { userId: targetUserId },
      orderBy: { year: 'asc' },
      select: { year: true },
    }),
  ]);

  const candidates = [oldestTransaction?.date.getUTCFullYear(), oldestValue?.year].filter(
    (y): y is number => typeof y === 'number',
  );

  return NextResponse.json({ minYear: candidates.length > 0 ? Math.min(...candidates) : null });
});
