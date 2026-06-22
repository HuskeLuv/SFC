'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { logger } from '@/lib/logger';

/**
 * Insumos agregados de carteira + fluxo de caixa + índices para auto-preencher
 * o planejamento (Sonhos e Aposentadoria) no modelo híbrido com override.
 * Espelha o payload de `GET /api/planejamento/contexto`.
 */
export interface PlanejamentoContexto {
  asOf: string;
  /** Patrimônio (soma de Portfolio.totalInvested). */
  patrimonio: number;
  /** Reserva de emergência atual (aproximação por custo/valor manual). */
  reservaEmergenciaAtual: number;
  /** Aporte médio mensal realizado (compras dos últimos 12 meses / 12). */
  aporteMensalRealizado: number;
  /** CDI anualizado mais recente (% a.a.) ou null. */
  cdiAnualizado: number | null;
  /** Inflação acumulada 12m via IPCA (% a.a.) ou null. */
  inflacao12m: number | null;
  /** Fallback de inflação quando não há série IPCA suficiente. */
  inflacaoFallback: number;
  cashflow: {
    year: number;
    activeMonths: number;
    /** Sobra média mensal (capacidade de poupança/aporte). */
    sobraMensalMedia: number;
    /** Despesa média mensal (proxy de renda-alvo na aposentadoria). */
    despesaMensalMedia: number;
    /** Despesa fixa média mensal (base para reserva de emergência ideal). */
    despesaFixaMensal: number;
  };
}

/**
 * Carrega o contexto financeiro do usuário. `enabled` permite adiar o fetch até
 * a UI precisar (ex.: só quando não há plano salvo e vamos semear defaults).
 */
export function usePlanejamentoContexto(enabled = true) {
  const query = useQuery<PlanejamentoContexto | null, Error>({
    queryKey: queryKeys.planejamento.contexto(),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/planejamento/contexto', {
        credentials: 'include',
        signal,
      });
      if (!res.ok) {
        if (res.status >= 500) {
          logger.warn(`Planejamento contexto: indisponível (${res.status})`);
          return null;
        }
        throw new Error(`Erro ao carregar contexto de planejamento (${res.status})`);
      }
      return (await res.json()) as PlanejamentoContexto;
    },
  });

  return {
    contexto: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
