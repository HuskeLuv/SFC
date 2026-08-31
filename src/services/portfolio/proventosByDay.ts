import { resolveProventoEvents } from '@/services/portfolio/resolveProventos';

export interface ProventosByDayResult {
  /** Proventos por dia (chave = dia normalizado UTC, valor = soma BRUTA do dia). */
  proventosByDay: Map<number, number>;
  /** Total bruto do período (inclui provisionados com data-com passada). */
  total: number;
}

/**
 * Carrega os proventos de um usuário agrupados pelo dia de PROVISIONAMENTO da
 * série (`e.bookingDay` = DATA-COM snapada pro pregão B3) e em valor BRUTO
 * (antes do IRRF de JCP).
 *
 * Usado para que a SÉRIE de rentabilidade (historicoTWR/MWR) e o card do resumo
 * sejam retorno TOTAL (capital + renda) na CONVENÇÃO GORILA — decisão de produto
 * de 31/08/2026 ("as rentabilidades devem bater com o Gorila"): provento bruto,
 * alocado na data-com, incluindo provisionados (data-com passada, pagamento
 * futuro). Antes (convenção Kinvo) usava líquido de IRRF creditado no pagamento.
 *
 * Consumidores de CAIXA REAL (dinheiro recebido de fato) NÃO devem usar este
 * módulo — devem ler os events de `resolveProventoEvents` filtrando
 * `paymentDay <= hoje` e somando `net`.
 *
 * A fonte é o HISTÓRICO GLOBAL (`resolveProventoEvents` → `asset_dividend_history`),
 * não a materialização por-usuário `PortfolioProvento`, para eliminar a janela em
 * que usuário novo via drawdown-fantasma antes da materialização rodar.
 */
export const loadProventosByDay = async (userId: string): Promise<ProventosByDayResult> => {
  const { events } = await resolveProventoEvents(userId);
  const proventosByDay = new Map<number, number>();
  let total = 0;
  for (const e of events) {
    proventosByDay.set(e.bookingDay, (proventosByDay.get(e.bookingDay) ?? 0) + e.gross);
    total += e.gross;
  }
  return { proventosByDay, total };
};
