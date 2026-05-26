import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { projetarComecotas, type FundoPosicao, type FundoTipo } from '@/services/ir/comecotasIR';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { FUNDO_TYPES_ALL } from '@/lib/fundoTypes';

/**
 * Projeção da próxima cobrança de come-cotas para fundos do usuário.
 *
 * Prioridade pro Asset.type classificado pela CVM (RCVM 175). Fallback pra
 * heurística por nome quando o ativo ainda não tem type específico (FUNDO-MANUAL,
 * fundo legacy não-reclassificado, etc).
 */

function inferirTipoFundo(
  assetType: string | null | undefined,
  nome: string | null | undefined,
): FundoTipo {
  switch (assetType) {
    case 'fia':
      return 'acoes';
    case 'fip':
      return 'fip';
    case 'fip-infra':
      return 'fip-infra';
    case 'fidc':
    case 'fiagro':
    case 'multimercado':
    case 'fund-rf':
    case 'fund-cambial':
    case 'etf-cvm':
      return 'longo-prazo';
  }
  // Fallback: heurística por nome (fundos manuais ou Asset.type genérico).
  if (!nome) return 'longo-prazo';
  const lower = nome.toLowerCase();
  if (lower.includes('ações') || lower.includes('fia') || lower.includes('acoes')) return 'acoes';
  if (lower.includes('curto prazo') || lower.includes('cp ')) return 'curto-prazo';
  return 'longo-prazo';
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const portfolio = await prisma.portfolio.findMany({
    where: {
      userId: targetUserId,
      asset: { type: { in: [...FUNDO_TYPES_ALL] } },
    },
    include: { asset: true },
  });

  const posicoes: FundoPosicao[] = portfolio
    .filter((p) => p.quantity > 0 && p.assetId)
    .map((p) => {
      const valorAplicado = p.totalInvested || p.quantity * p.avgPrice;
      const currentPrice = p.asset?.currentPrice ? Number(p.asset.currentPrice) : p.avgPrice;
      const valorAtualizado =
        currentPrice && p.quantity > 0 ? p.quantity * currentPrice : valorAplicado;
      return {
        symbol: p.asset?.symbol || 'FUNDO',
        nome: p.asset?.name || p.asset?.symbol || 'Fundo',
        valorAplicado,
        valorAtualizado,
        startDate: p.lastUpdate ?? new Date(),
        tipo: inferirTipoFundo(p.asset?.type, p.asset?.name),
      };
    });

  const apuracao = projetarComecotas(posicoes);
  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
  });
});
