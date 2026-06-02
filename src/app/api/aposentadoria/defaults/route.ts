/**
 * Defaults pra pré-popular o simulador na primeira vez (sem plano salvo).
 *
 * - patrimonio: soma de Portfolio.totalInvested do user (patrimônio disponível
 *   aproximado).
 * - rentNom: CDI anualizado mais recente (% a.a.). Fallback 12%.
 * - inflacao: default conservador (% a.a.) dentro da meta do BCB — o user
 *   ajusta no slider. Não derivamos do IPCA aqui porque acumular 12 meses de
 *   forma confiável foge do escopo de uma sugestão inicial.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

const DEFAULT_RENT_NOM = 12; // % a.a.
const DEFAULT_INFLACAO = 4.5; // % a.a.

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

  let rentNom = DEFAULT_RENT_NOM;
  if (latestCdi) {
    // CDI_ANUALIZADO vem como % anual (ex.: 13.65 = 13,65%/ano).
    const cdi = Number(latestCdi.value);
    if (Number.isFinite(cdi) && cdi > 0 && cdi < 100) {
      rentNom = Math.round(cdi * 10) / 10; // 1 casa decimal
    }
  }

  const patrimonio = Math.round(Number(portfolioAgg._sum.totalInvested ?? 0) * 100) / 100;

  return NextResponse.json({
    patrimonio,
    rentNom,
    inflacao: DEFAULT_INFLACAO,
  });
});
