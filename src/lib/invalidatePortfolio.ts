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
}
