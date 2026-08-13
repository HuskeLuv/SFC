'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';

export type { SaudeFinanceiraPayload };
export type {
  ComposicaoLinha,
  PassivoLinha,
} from '@/services/saudeFinanceira/saudeFinanceiraServer';
export type {
  SaudeFinanceiraIndicadores,
  BenchmarkPatrimonial,
  StatusSaudeCodigo,
} from '@/services/saudeFinanceira/indicadores';

/**
 * Diagnóstico de saúde financeira (GET /api/saude-financeira). Read-only —
 * o payload deriva de carteira/fluxo/dívidas, que invalidam este cache nas
 * suas próprias mutações (invalidatePortfolioDerivedQueries + useDividas).
 */
export function useSaudeFinanceira() {
  const query = useQuery<SaudeFinanceiraPayload, Error>({
    queryKey: queryKeys.saudeFinanceira.all,
    queryFn: async () => {
      const res = await fetch('/api/saude-financeira', { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar saúde financeira (${res.status})`);
      return (await res.json()) as SaudeFinanceiraPayload;
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
