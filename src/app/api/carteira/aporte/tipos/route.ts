import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { TIPO_LABELS, mapPortfolioToTipo } from '@/lib/portfolioTipoMapping';
import { isShareBasedAssetType } from '@/lib/assetClassification';

/**
 * Tipos de ativo do usuário disponíveis para APORTE.
 *
 * Opção 3: aporte é operação de valor (renda-fixa/reservas/seguro). Ativos
 * share-based NÃO entram — eles crescem via Comprar. O filtro é por Asset.type
 * (não pelo tipo de UI): 'previdencia' de fundo CVM é share-based e sai, mas
 * seguro manual ('insurance') mapeia para o MESMO tipo de UI e continua
 * aportável (auditoria 2026-08-06, achado #6 — antes fundos/cripto/moedas
 * apareciam no aporte e a transação quantity=1 envenenava o recálculo).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const portfolio = await prisma.portfolio.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
  });

  const tiposSet = new Set<string>();
  portfolio.forEach((item) => {
    if (isShareBasedAssetType(item.asset?.type)) return;
    const tipo = mapPortfolioToTipo(item);
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
