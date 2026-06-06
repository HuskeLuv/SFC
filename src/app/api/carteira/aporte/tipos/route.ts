import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { TIPO_LABELS, mapPortfolioToTipo, EQUITY_TIPOS } from '@/lib/portfolioTipoMapping';

/**
 * Tipos de ativo do usuário disponíveis para APORTE.
 *
 * Opção 3: aporte é operação de valor (renda-fixa/reservas/fundos legados). Ativos
 * share-based (ação/FII/ETF/REIT/BDR) NÃO entram — eles crescem via Comprar. Por
 * isso o aporte usa este endpoint em vez de `/api/carteira/resgate/tipos` (que
 * lista todos os tipos resgatáveis).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const portfolio = await prisma.portfolio.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
  });

  const tiposSet = new Set<string>();
  portfolio.forEach((item) => {
    const tipo = mapPortfolioToTipo(item);
    if (tipo && !EQUITY_TIPOS.has(tipo)) {
      tiposSet.add(tipo);
    }
  });

  const tipos = Array.from(tiposSet).map((tipo) => ({
    value: tipo,
    label: TIPO_LABELS[tipo] || tipo,
  }));

  return NextResponse.json({ success: true, tipos });
});
