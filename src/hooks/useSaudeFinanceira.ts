'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import type {
  EvolucaoPonto,
  TendenciasSaude,
} from '@/services/saudeFinanceira/saudeFinanceiraSnapshot';

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
export type {
  EvolucaoPonto,
  TendenciasSaude,
  TendenciaDirecao,
  SnapshotData,
} from '@/services/saudeFinanceira/saudeFinanceiraSnapshot';

/** Payload do GET principal: diagnóstico + setas vs último mês registrado. */
export type SaudeFinanceiraResponse = SaudeFinanceiraPayload & { tendencias: TendenciasSaude };

/**
 * Diagnóstico de saúde financeira (GET /api/saude-financeira). Read-only —
 * o payload deriva de carteira/fluxo/dívidas, que invalidam este cache nas
 * suas próprias mutações (invalidatePortfolioDerivedQueries + useDividas).
 */
export function useSaudeFinanceira() {
  const query = useQuery<SaudeFinanceiraResponse, Error>({
    queryKey: queryKeys.saudeFinanceira.all,
    queryFn: async () => {
      const res = await fetch('/api/saude-financeira', { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar saúde financeira (${res.status})`);
      return (await res.json()) as SaudeFinanceiraResponse;
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/** Série mensal de snapshots (gráfico de evolução). */
export function useSaudeFinanceiraEvolucao() {
  const query = useQuery<EvolucaoPonto[], Error>({
    queryKey: queryKeys.saudeFinanceira.evolucao(),
    queryFn: async () => {
      const res = await fetch('/api/saude-financeira/evolucao', { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar evolução (${res.status})`);
      const data = (await res.json()) as { snapshots: EvolucaoPonto[] };
      return data.snapshots ?? [];
    },
  });

  return {
    snapshots: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
