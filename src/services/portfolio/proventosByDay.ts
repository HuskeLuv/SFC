import { resolveProventoEvents } from '@/services/portfolio/resolveProventos';

export interface ProventosByDayResult {
  /** Proventos recebidos por dia (chave = dia normalizado UTC, valor = soma líquida de IRRF). */
  proventosByDay: Map<number, number>;
  /** Total recebido no período (líquido de IRRF). */
  total: number;
}

/**
 * Carrega os proventos recebidos de um usuário (líquidos de IRRF, até hoje),
 * agrupados por dia de pagamento.
 *
 * Usado para que a SÉRIE de rentabilidade (historicoTWR/MWR) seja retorno TOTAL
 * (capital + renda), igual à metodologia do Kinvo e ao número do card. Sem isso,
 * um ativo que caiu de preço mas pagou dividendos aparecia só com o retorno de
 * capital no gráfico (ex.: FII -11% no preço, mas +7% total com proventos).
 *
 * A fonte é o HISTÓRICO GLOBAL (`resolveProventoEvents` → `asset_dividend_history`),
 * não a materialização por-usuário `PortfolioProvento`, para eliminar a janela em
 * que usuário novo via drawdown-fantasma antes da materialização rodar.
 */
export const loadProventosByDay = async (userId: string): Promise<ProventosByDayResult> => {
  const { events, total } = await resolveProventoEvents(userId);
  const proventosByDay = new Map<number, number>();
  for (const e of events) {
    proventosByDay.set(e.paymentDay, (proventosByDay.get(e.paymentDay) ?? 0) + e.net);
  }
  return { proventosByDay, total };
};
