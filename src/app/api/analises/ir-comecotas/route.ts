import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { projetarComecotas, type FundoPosicao, type FundoTipo } from '@/services/ir/comecotasIR';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Projeção da próxima cobrança de come-cotas para fundos do usuário.
 *
 * Como o tipo de fundo (curto/longo prazo/ações) não está hoje persistido
 * na nossa modelagem, usamos heurística simples a partir do nome:
 *  - nome contém "Ações" ou "FIA" → 'acoes' (sem come-cotas)
 *  - nome contém "Curto Prazo" ou "Crédito Privado CP" → 'curto-prazo' (20%)
 *  - default → 'longo-prazo' (15%)
 * Quando tiver flag explícita no cadastro, refinar.
 */

function inferirTipoFundo(nome: string | null | undefined): FundoTipo {
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
      asset: { type: { in: ['fund', 'funds'] } },
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
        tipo: inferirTipoFundo(p.asset?.name),
      };
    });

  const apuracao = projetarComecotas(posicoes);
  return NextResponse.json({
    asOf: new Date().toISOString(),
    ...apuracao,
  });
});
