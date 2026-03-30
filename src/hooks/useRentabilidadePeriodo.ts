import { useQuery } from '@tanstack/react-query';
import { IndexData } from './useIndices';
import { queryKeys } from '@/lib/queryKeys';

interface UseRentabilidadePeriodoResult {
  data: IndexData[];
  loading: boolean;
  error: string | null;
}

/**
 * Busca TWR recalculado para o período (primeiro ponto = 0%).
 * Usa /api/carteira/resumo?twrStartDate=X que recalcula desde o início do período.
 */
export const useRentabilidadePeriodo = (
  startDate: number | undefined,
  options?: { enabled?: boolean },
): UseRentabilidadePeriodoResult => {
  const enabled = options?.enabled !== false && Number.isFinite(startDate) && (startDate ?? 0) > 0;

  const {
    data = [],
    isLoading: loading,
    error: queryError,
  } = useQuery<IndexData[]>({
    queryKey: queryKeys.carteira.rentabilidade(startDate?.toString()),
    queryFn: async () => {
      const url = `/api/carteira/resumo?twrStartDate=${startDate}`;
      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        throw new Error('Erro ao buscar rentabilidade do período');
      }

      const result = await response.json();
      const twr = result.historicoTWRPeriodo;
      return Array.isArray(twr)
        ? twr.map((t: { data: number; value: number }) => ({ date: t.data, value: t.value }))
        : [];
    },
    enabled,
  });

  return { data, loading, error: queryError ? (queryError as Error).message : null };
};
