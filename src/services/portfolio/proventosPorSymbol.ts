import { logger } from '@/lib/logger';
import { resolveProventoEvents } from './resolveProventos';

/**
 * Total LÍQUIDO de proventos já recebidos (pagos até hoje) por ticker do
 * usuário — mesma fonte da aba Análise > Proventos (`resolveProventoEvents`:
 * quantidade elegível na data-com, IRRF de JCP, overrides manuais e dismiss).
 *
 * Auditoria Pedro 25/08/2026 (item B1): as abas de renda variável mostravam
 * rentabilidade só de preço — FIIs "−4,52%" com ≈ R$ 50 mil de rendimentos
 * recebidos. Gorila/Kinvo contam proventos no P&L da posição.
 */
export const proventosRecebidosPorSymbol = async (userId: string): Promise<Map<string, number>> => {
  const porSymbol = new Map<string, number>();
  try {
    const { events } = await resolveProventoEvents(userId);
    for (const e of events) {
      porSymbol.set(e.symbol, (porSymbol.get(e.symbol) ?? 0) + e.net);
    }
  } catch (error: unknown) {
    // Proventos são complemento da aba: falha aqui não pode derrubar a tabela.
    logger.warn(
      `⚠️  proventosRecebidosPorSymbol falhou (aba segue sem proventos): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return porSymbol;
};

/**
 * Aplica os proventos recebidos nas linhas de uma aba: preenche `proventos`
 * e recalcula `rentabilidade` = (atual + proventos − aplicado) / aplicado.
 * Linha sem base (aplicado ≤ 0) mantém a rentabilidade original.
 */
export const aplicarProventosNosAtivos = <
  T extends {
    ticker: string;
    valorTotal: number;
    valorAtualizado: number;
    rentabilidade: number;
    proventos?: number;
  },
>(
  ativos: T[],
  proventosPorSymbol: Map<string, number>,
): void => {
  for (const a of ativos) {
    const proventos = proventosPorSymbol.get(a.ticker) ?? 0;
    a.proventos = proventos;
    if (a.valorTotal > 0) {
      a.rentabilidade = ((a.valorAtualizado + proventos - a.valorTotal) / a.valorTotal) * 100;
    }
  }
};
