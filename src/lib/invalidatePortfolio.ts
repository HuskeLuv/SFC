import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Invalidate every React Query cache that derives from a user's transactions/portfolio.
 *
 * Call after any mutation that changes Portfolio rows or StockTransaction rows
 * (edit/delete transaction, edit/delete provento, delete portfolio, etc.).
 * Without this, cards and rentabilidade calculations keep rendering stale totals
 * until the user reloads the page.
 */
export function invalidatePortfolioDerivedQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.carteira.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.proventos.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.instituicao.distribuicao() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.sensibilidadeCarteira.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.coberturaFgc.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.riscoRetorno.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.ir.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.alocacao.config() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reserva.emergencia() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reserva.oportunidade() });
  // F1.10: /api/cashflow/investimentos deriva direto de StockTransaction.notes —
  // qualquer compra (incl. reinvestimento) muda o agrupamento por tipo e
  // a soma Aporte/Resgate. Sem essa invalidação o Fluxo de Caixa fica
  // stale até reload.
  void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
  // O contexto de planejamento deriva de patrimônio, aportes e reserva — todos
  // mudam com qualquer transação. Mantém os defaults/seeds do planejamento
  // (Sonhos/Aposentadoria) coerentes com a carteira em tempo real.
  void queryClient.invalidateQueries({ queryKey: queryKeys.planejamento.all });
}
