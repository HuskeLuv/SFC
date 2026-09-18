/**
 * Carrega a projeção de come-cotas de um usuário (posições em fundos CVM).
 *
 * A inferência de tipo de fundo e a leitura do Portfolio moravam dentro de
 * /api/analises/ir-comecotas; foram extraídas aqui para que a Agenda (fonte
 * `ir`) marque 31/05 e 30/11 com o MESMO número que a tela de IR mostra.
 */
import { prisma } from '@/lib/prisma';
import { FUNDO_TYPES_ALL } from '@/lib/fundoTypes';
import {
  projetarComecotas,
  type ComecotasResult,
  type FundoPosicao,
  type FundoTipo,
} from './comecotasIR';

/**
 * Prioridade pro Asset.type classificado pela CVM (RCVM 175). Fallback pra
 * heurística por nome quando o ativo ainda não tem type específico
 * (FUNDO-MANUAL, fundo legacy não-reclassificado, etc).
 */
export function inferirTipoFundo(
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
  if (!nome) return 'longo-prazo';
  const lower = nome.toLowerCase();
  if (lower.includes('ações') || lower.includes('fia') || lower.includes('acoes')) return 'acoes';
  if (lower.includes('curto prazo') || lower.includes('cp ')) return 'curto-prazo';
  return 'longo-prazo';
}

export async function carregarPosicoesFundos(userId: string): Promise<FundoPosicao[]> {
  const portfolio = await prisma.portfolio.findMany({
    where: { userId, asset: { type: { in: [...FUNDO_TYPES_ALL] } } },
    include: { asset: true },
  });

  return portfolio
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
}

export async function carregarComecotas(
  userId: string,
  asOfDate: Date = new Date(),
): Promise<ComecotasResult> {
  return projetarComecotas(await carregarPosicoesFundos(userId), asOfDate);
}
