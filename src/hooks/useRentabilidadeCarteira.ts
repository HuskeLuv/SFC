'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { logger } from '@/lib/logger';

/**
 * Rentabilidade anualizada da própria carteira (MWR anualizado desde o início),
 * de `/api/analises/rentabilidade-janelas`. Usada como fonte opcional para a
 * "rentabilidade nominal" do simulador de aposentadoria (alternativa ao CDI).
 *
 * `enabled` permite carregar só sob demanda — o cálculo é pesado (monta o
 * histórico de patrimônio), então não rodamos ao abrir o planejamento.
 */
export function useRentabilidadeCarteira(enabled = false) {
  const query = useQuery<number | null, Error>({
    queryKey: queryKeys.carteira.janelas(),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/analises/rentabilidade-janelas', {
        credentials: 'include',
        signal,
      });
      if (!res.ok) {
        if (res.status >= 500) {
          logger.warn(`Rentabilidade carteira: indisponível (${res.status})`);
          return null;
        }
        throw new Error(`Erro ao carregar rentabilidade da carteira (${res.status})`);
      }
      const data = await res.json();
      const aa = data?.janelas?.fromBegin?.portfolioMwrAnnualized;
      return typeof aa === 'number' && Number.isFinite(aa) ? Math.round(aa * 10) / 10 : null;
    },
  });

  return {
    rentabilidadeAA: query.data ?? null,
    loading: query.isFetching,
    error: query.error?.message ?? null,
  };
}
