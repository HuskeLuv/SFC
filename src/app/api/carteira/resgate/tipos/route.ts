import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { TIPO_LABELS, mapPortfolioToTipo } from '@/lib/portfolioTipoMapping';
import { getTesouroDestinoByAssetId } from '@/services/portfolio/tesouroDestino';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const portfolio = await prisma.portfolio.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
  });

  // Tesouro comprado para reserva conta no tipo da reserva, não em renda fixa.
  const tesouroAssetIds = portfolio
    .filter((item) => item.asset?.type === 'tesouro-direto' && item.assetId)
    .map((item) => item.assetId!) as string[];
  const destinoByAssetId = await getTesouroDestinoByAssetId(targetUserId, tesouroAssetIds);

  const tiposSet = new Set<string>();
  portfolio.forEach((item) => {
    const tipo = mapPortfolioToTipo(item, item.assetId ? destinoByAssetId.get(item.assetId) : null);
    if (tipo) {
      tiposSet.add(tipo);
    }
  });

  const tipos = Array.from(tiposSet).map((tipo) => ({
    value: tipo,
    label: TIPO_LABELS[tipo] || tipo,
  }));

  return NextResponse.json({ success: true, tipos });
});
