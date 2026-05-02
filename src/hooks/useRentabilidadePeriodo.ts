import { useQuery } from '@tanstack/react-query';
import { IndexData } from './useIndices';
import { queryKeys } from '@/lib/queryKeys';

interface UseRentabilidadePeriodoResult {
  /** TWR cumulativo recalculado para o período (primeiro ponto = 0%). */
  data: IndexData[];
  /** MWR cumulativo recalculado para o período (primeiro ponto = 0%). */
  mwr: IndexData[];
  loading: boolean;
  error: string | null;
}

/**
 * Busca TWR + MWR cumulativos recalculados pra janela [startDate, hoje].
 * Usa /api/carteira/resumo?twrStartDate=X — o endpoint zera as duas séries
 * no início do período pra que o gráfico comece em 0%.
 */
export const useRentabilidadePeriodo = (
  startDate: number | undefined,
  options?: { enabled?: boolean },
): UseRentabilidadePeriodoResult => {
  const enabled = options?.enabled !== false && Number.isFinite(startDate) && (startDate ?? 0) > 0;

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery<{ twr: IndexData[]; mwr: IndexData[] }>({
    queryKey: queryKeys.carteira.rentabilidade(startDate?.toString()),
    queryFn: async () => {
      const url = `/api/carteira/resumo?twrStartDate=${startDate}`;
      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        throw new Error('Erro ao buscar rentabilidade do período');
      }

      const result = await response.json();
      const toIndex = (s: unknown): IndexData[] =>
        Array.isArray(s)
          ? s.map((t: { data: number; value: number }) => ({ date: t.data, value: t.value }))
          : [];
      return {
        twr: toIndex(result.historicoTWRPeriodo),
        mwr: toIndex(result.historicoMWRPeriodo),
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
