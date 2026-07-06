import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getBaseAplicadaAnterior } from '@/services/cashflow/evolucaoPatrimonioServer';

/**
 * GET /api/cashflow/evolucao-patrimonio?year=YYYY
 *
 * Insumos da linha "Evolução do Patrimônio" da planilha:
 * - baseAplicadaAnterior: total nominal aplicado até 31/dez do ano anterior
 *   (aportes acumulados, sem marcação a mercado)
 * - snapshots: meses do ano já travados pelo cron do último dia útil
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  if (isNaN(year) || year < 1900 || year > 2100) {
    return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
  }

  const [baseAplicadaAnterior, snapshots] = await Promise.all([
    getBaseAplicadaAnterior(targetUserId, year),
    prisma.cashflowPatrimonioSnapshot.findMany({
      where: { userId: targetUserId, year },
      select: { month: true, valor: true },
      orderBy: { month: 'asc' },
    }),
  ]);

  return NextResponse.json({ year, baseAplicadaAnterior, snapshots });
});
