import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/cashflow/conta-corrente-anterior?year=YYYY
 *
 * Saldo total do bloco "Conta Corrente" em dezembro do ano ANTERIOR ao
 * solicitado. Alimenta o carry-over automático da planilha: o que ficou
 * parado na conta em 31/dez aparece como "Saldo Conta Corrente Mês Anterior"
 * em janeiro do ano seguinte (regra Pedro Haddad).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  if (isNaN(year) || year < 1900 || year > 2100) {
    return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
  }

  // Grupos type='saldo' cobrem o template "Conta Corrente" e overrides do
  // usuário (a personalização preserva o type).
  const result = await prisma.cashflowValue.aggregate({
    _sum: { value: true },
    where: {
      userId: targetUserId,
      year: year - 1,
      month: 11,
      item: { group: { type: 'saldo' } },
    },
  });

  return NextResponse.json({ year, saldoDezembroAnterior: Number(result._sum.value ?? 0) });
});
