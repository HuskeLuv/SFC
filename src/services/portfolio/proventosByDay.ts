import { resolveProventoEvents } from '@/services/portfolio/resolveProventos';

export interface ProventosByDayResult {
  /** Proventos recebidos por dia (chave = dia normalizado UTC, valor = soma líquida de IRRF). */
  proventosByDay: Map<number, number>;
  /** Total recebido no período (líquido de IRRF). */
  total: number;
}

/**
 * Carrega os proventos recebidos de um usuário (líquidos de IRRF, até hoje),
 * agrupados pelo dia de PROVISIONAMENTO da série (`e.bookingDay`).
 *
 * Usado para que a SÉRIE de rentabilidade (historicoTWR/MWR) seja retorno TOTAL
 * (capital + renda), igual à metodologia do Kinvo e ao número do card. Sem isso,
 * um ativo que caiu de preço mas pagou dividendos aparecia só com o retorno de
 * capital no gráfico (ex.: FII -11% no preço, mas +7% total com proventos).
 *
 * Agrupa pelo `bookingDay` (= data de PAGAMENTO snapada pro pregão B3), espelhando
 * o Kinvo, que credita o provento no pagamento (não na data-ex). O `total` (renda
 * acumulada, paridade com Kinvo) independe da data — só soma net.
 *
 * A fonte é o HISTÓRICO GLOBAL (`resolveProventoEvents` → `asset_dividend_history`),
 * não a materialização por-usuário `PortfolioProvento`, para eliminar a janela em
 * que usuário novo via drawdown-fantasma antes da materialização rodar.
 */
export const loadProventosByDay = async (userId: string): Promise<ProventosByDayResult> => {
  const { events, total } = await resolveProventoEvents(userId);
  const proventosByDay = new Map<number, number>();
  for (const e of events) {
    proventosByDay.set(e.bookingDay, (proventosByDay.get(e.bookingDay) ?? 0) + e.net);
  }
  return { proventosByDay, total };
};
