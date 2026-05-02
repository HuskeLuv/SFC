import { useQuery } from '@tanstack/react-query';
import { IndexData } from './useIndices';
import { queryKeys } from '@/lib/queryKeys';

interface UseCarteiraHistoricoResult {
  /** Série TWR diária. Compatível com consumers existentes. */
  data: IndexData[];
  /** Série MWR diária (mesma escala do TWR). */
  mwr: IndexData[];
  loading: boolean;
  error: string | null;
}

export const useCarteiraHistorico = (
  startDate?: number,
  options?: { enabled?: boolean },
): UseCarteiraHistoricoResult => {
  const enabled = options?.enabled !== false;

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery<{ twr: IndexData[]; mwr: IndexData[] }>({
    queryKey: queryKeys.carteira.historico(),
    queryFn: async ({ signal }) => {
      let url = '/api/analises/carteira-historico';
      if (startDate) {
        url += `?startDate=${startDate}`;
      }

      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error('Erro ao buscar histórico da carteira');
      }

      const result = await response.json();
      return {
        twr: Array.isArray(result.data) ? result.data : [],
        mwr: Array.isArray(result.mwr) ? result.mwr : [],
      };
    },
    enabled,
  });

  return {
    data: data?.twr ?? [],
    mwr: data?.mwr ?? [],
    loading,
    error: queryError ? (queryError as Error).message : null,
  };
};
