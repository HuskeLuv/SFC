import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { mapPortfolioToTipo, matchesTipo } from '@/lib/portfolioTipoMapping';

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

  const filtered = portfolio.filter((item) => matchesTipo(mapPortfolioToTipo(item), tipo));

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

  if (hasUnknown && (!search || 'não informada'.includes(search))) {
    institList.unshift({ value: 'unknown', label: 'Instituição não informada' });
  }

  return NextResponse.json({ success: true, instituicoes: institList });
});
