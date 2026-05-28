/**
 * Defaults pra pré-popular o form inline de criação de objetivo.
 *
 * - rate: CDI anual mais recente convertido pra mensal composto. Cobre o caso
 *   default — user pode editar pra refletir a expectativa real.
 * - available: soma Portfolio.totalInvested do user (aproximação de patrimônio
 *   disponível). Não usa o saldoBruto computado em /api/carteira/resumo
 *   porque aquele endpoint é pesado (snapshots, séries, etc.) e aqui só
 *   precisa de uma sugestão.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

const DEFAULT_RATE_MONTHLY = 0.009; // ~0.9%/mês como fallback se CDI indisponível

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const [latestCdi, portfolioAgg] = await Promise.all([
    prisma.economicIndex.findFirst({
      where: { indexType: 'CDI_ANUALIZADO' },
      orderBy: { date: 'desc' },
      select: { value: true },
    }),
    prisma.portfolio.aggregate({
      where: { userId: targetUserId },
      _sum: { totalInvested: true },
    }),
  ]);

  let rate = DEFAULT_RATE_MONTHLY;
  if (latestCdi) {
    // CDI_ANUALIZADO vem como % anual (ex.: 13.65 = 13.65%/ano).
    const cdiAnual = Number(latestCdi.value) / 100;
    if (Number.isFinite(cdiAnual) && cdiAnual > 0 && cdiAnual < 1) {
      rate = Math.pow(1 + cdiAnual, 1 / 12) - 1;
    }
  }

  const available = Number(portfolioAgg._sum.totalInvested ?? 0);

  return NextResponse.json({
    rate: Math.round(rate * 1e6) / 1e6, // 6 casas decimais
    available: Math.round(available * 100) / 100,
  });
});
