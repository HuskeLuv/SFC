import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  TRECHO_MARCADOR_PRECO_MEDIO,
  temPrecoMedioNaoInformado,
} from '@/lib/precoMedioNaoInformado';

/**
 * Posições abertas cuja compra veio do banco (Open Finance) sem o custo: o preço médio é a
 * cotação do dia da conexão até o cliente informar. Alimenta o aviso na linha da Carteira e o
 * aviso agregado ("N posições vieram do banco sem preço médio").
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const compras = await prisma.stockTransaction.findMany({
    where: {
      userId: targetUserId,
      type: 'compra',
      assetId: { not: null },
      notes: { contains: TRECHO_MARCADOR_PRECO_MEDIO },
    },
    select: { assetId: true, notes: true },
  });
  const assetIds = [
    ...new Set(
      compras.filter((c) => temPrecoMedioNaoInformado(c.notes)).map((c) => c.assetId as string),
    ),
  ];
  if (assetIds.length === 0) return NextResponse.json({ posicoes: [] });

  const portfolios = await prisma.portfolio.findMany({
    where: { userId: targetUserId, assetId: { in: assetIds }, quantity: { gt: 0 } },
    select: { id: true, asset: { select: { symbol: true, name: true, type: true } } },
  });
  const posicoes = portfolios
    .map((p) => ({
      portfolioId: p.id,
      ticker: p.asset?.symbol ?? '',
      nome: p.asset?.name ?? '',
      tipo: p.asset?.type ?? '',
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return NextResponse.json({ posicoes });
});
