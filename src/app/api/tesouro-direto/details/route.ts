import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/tesouro-direto/details?assetId={id}
 *
 * Returns the latest TesouroDiretoPrice data for a given Tesouro asset.
 * Used by Step4 in the wizard to auto-fill rates, maturity, and PU values.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuthWithActing(request);

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');

  if (!assetId) {
    return NextResponse.json({ error: 'assetId é obrigatório' }, { status: 400 });
  }

  // Look up the asset to get its symbol (which encodes bondType + maturity year)
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, symbol: true, name: true, type: true },
  });

  if (!asset || asset.type !== 'tesouro-direto') {
    return NextResponse.json({ error: 'Título não encontrado' }, { status: 404 });
  }

  // Parse bond type and maturity year from the asset name (e.g., "Tesouro Selic 2029")
  // The name is set by syncTesouroAssetCatalog as "{bondType} {maturityYear}"
  const nameMatch = asset.name.match(/^(.+)\s(\d{4})$/);
  if (!nameMatch) {
    return NextResponse.json({
      success: true,
      asset: { id: asset.id, name: asset.name },
      price: null,
    });
  }

  const bondType = nameMatch[1];
  const maturityYear = parseInt(nameMatch[2]);

  // Find the latest price for this bond
  const latestPrice = await prisma.tesouroDiretoPrice.findFirst({
    where: {
      bondType,
      maturityDate: {
        gte: new Date(`${maturityYear}-01-01`),
        lt: new Date(`${maturityYear + 1}-01-01`),
      },
    },
    orderBy: { baseDate: 'desc' },
  });

  if (!latestPrice) {
    return NextResponse.json({
      success: true,
      asset: { id: asset.id, name: asset.name },
      price: null,
    });
  }

  return NextResponse.json({
    success: true,
    asset: {
      id: asset.id,
      name: asset.name,
      bondType: latestPrice.bondType,
      maturityDate: latestPrice.maturityDate.toISOString(),
    },
    price: {
      baseDate: latestPrice.baseDate.toISOString(),
      buyRate: latestPrice.buyRate?.toNumber() ?? null,
      sellRate: latestPrice.sellRate?.toNumber() ?? null,
      buyPU: latestPrice.buyPU?.toNumber() ?? null,
      sellPU: latestPrice.sellPU?.toNumber() ?? null,
      basePU: latestPrice.basePU?.toNumber() ?? null,
    },
  });
});
