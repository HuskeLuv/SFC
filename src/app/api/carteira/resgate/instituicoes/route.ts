import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { mapPortfolioToTipo, matchesTipo } from '@/lib/portfolioTipoMapping';
import { getTesouroDestinoByAssetId } from '@/services/portfolio/tesouroDestino';

const extractInstitutionId = (notes?: string | null) => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.operation?.instituicaoId || null;
  } catch {
    return null;
  }
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get('tipo') || '';
  const search = (searchParams.get('search') || '').toLowerCase();
  const limit = parseInt(searchParams.get('limit') || '200', 10);

  const { targetUserId } = await requireAuthWithActing(request);

  if (!tipo) {
    return NextResponse.json({ success: false, error: 'Tipo é obrigatório' }, { status: 400 });
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

  // Sem assetId (legado) o resgate é impossível (POST rejeita com 400) —
  // não deixar esses portfolios criarem o balde "Instituição não informada"
  // (rodada 3, achado #12).
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

  const institutionByKey = new Map<string, string | null>();
  transactions.forEach((transaction) => {
    const key = transaction.assetId;
    if (!key || institutionByKey.has(key)) return;
    institutionByKey.set(key, extractInstitutionId(transaction.notes));
  });

  const institutionIds = new Set<string>();
  let hasUnknown = false;
  filtered.forEach((item) => {
    const key = item.assetId;
    const instId = key ? institutionByKey.get(key) : null;
    if (instId) {
      institutionIds.add(instId);
    } else {
      hasUnknown = true;
    }
  });

  const institutions = institutionIds.size
    ? await prisma.institution.findMany({ where: { id: { in: Array.from(institutionIds) } } })
    : [];

  const institList = institutions
    .filter((inst) => (search ? inst.nome.toLowerCase().includes(search) : true))
    .slice(0, limit)
    .map((inst) => ({ value: inst.id, label: inst.nome }));

  // Match contra o LABEL COMPLETO (rodada 3, achado #15): o InstitutionPicker
  // refaz o fetch usando o texto selecionado como search — "instituição não
  // informada" não está contido em "não informada" e a opção sumia do dropdown
  // logo após ser escolhida.
  const UNKNOWN_LABEL = 'Instituição não informada';
  if (hasUnknown && (!search || UNKNOWN_LABEL.toLowerCase().includes(search))) {
    institList.unshift({ value: 'unknown', label: UNKNOWN_LABEL });
  }

  return NextResponse.json({ success: true, instituicoes: institList });
});
