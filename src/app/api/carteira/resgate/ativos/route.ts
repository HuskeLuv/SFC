import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { mapPortfolioToTipo, matchesTipo } from '@/lib/portfolioTipoMapping';
import { getTesouroDestinoByAssetId } from '@/services/portfolio/tesouroDestino';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get('tipo') || '';
  const search = (searchParams.get('search') || '').toLowerCase();
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const instituicaoId = searchParams.get('instituicaoId') || '';

  const { targetUserId } = await requireAuthWithActing(request);

  if (!tipo || !instituicaoId) {
    return NextResponse.json(
      { success: false, error: 'Tipo e instituição são obrigatórios' },
      { status: 400 },
    );
  }

  const portfolio = await prisma.portfolio.findMany({
    where: { userId: targetUserId },
    include: { asset: true },
  });

  // Tesouro comprado para reserva pertence ao tipo da reserva (bug ago/2026:
  // o Selic da Reserva de Emergência só aparecia em Renda Fixa).
  const tesouroAssetIds = portfolio
    .filter((item) => item.asset?.type === 'tesouro-direto' && item.assetId)
    .map((item) => item.assetId!) as string[];
  const destinoByAssetId = await getTesouroDestinoByAssetId(targetUserId, tesouroAssetIds);

  // Sem assetId (legado) o POST /resgate rejeita com 400 — não listar o que
  // não pode ser resgatado (rodada 3, achado #12).
  const filtered = portfolio.filter(
    (item) =>
      !!item.assetId &&
      matchesTipo(mapPortfolioToTipo(item, destinoByAssetId.get(item.assetId)), tipo),
  );

  const assetIds = filtered.map((item) => item.assetId).filter(Boolean) as string[];

  const transactions =
    assetIds.length > 0
      ? await prisma.stockTransaction.findMany({
          where: {
            userId: targetUserId,
            type: 'compra',
            assetId: { in: assetIds },
          },
          orderBy: { date: 'desc' },
        })
      : [];

  const extractInstitutionId = (notes?: string | null) => {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes);
      return parsed?.operation?.instituicaoId || null;
    } catch {
      return null;
    }
  };

  const institutionByKey = new Map<string, string | null>();
  transactions.forEach((transaction) => {
    const key = transaction.assetId;
    if (!key || institutionByKey.has(key)) return;
    institutionByKey.set(key, extractInstitutionId(transaction.notes));
  });

  const filteredByInstitution = filtered.filter((item) => {
    const key = item.assetId;
    const instId = key ? institutionByKey.get(key) : null;
    if (instituicaoId === 'unknown') {
      return !instId;
    }
    return instId === instituicaoId;
  });

  const assets = filteredByInstitution
    .map((item) => {
      const symbol = item.asset?.symbol || '';
      const name = item.asset?.name || '';
      const label = symbol ? `${symbol} - ${name}` : name;
      const subtitle = item.asset?.type;

      return {
        id: item.id,
        portfolioId: item.id,
        assetId: item.assetId,
        label,
        subtitle,
        symbol,
        name,
        tipoAtivo: tipo,
        quantity: item.quantity,
        avgPrice: item.avgPrice,
        totalInvested: item.totalInvested,
        currency: item.asset?.currency || 'BRL',
      };
    })
    .filter((item) => {
      if (!search) return true;
      return (
        item.label.toLowerCase().includes(search) ||
        item.symbol.toLowerCase().includes(search) ||
        item.name.toLowerCase().includes(search)
      );
    })
    .slice(0, limit);

  return NextResponse.json({ success: true, assets });
});
