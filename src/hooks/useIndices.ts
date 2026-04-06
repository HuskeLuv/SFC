import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface IndexData {
  date: number;
  value: number;
}

export interface IndexResponse {
  symbol: string;
  name: string;
  data: IndexData[];
}

interface UseIndicesResult {
  indices: IndexResponse[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useIndices = (
  range: '1d' | '1mo' | '1y' | '2y' | '3y' | '5y' | '10y' = '1y',
  startDate?: number,
): UseIndicesResult => {
  const {
    data: indices = [],
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<IndexResponse[]>({
    queryKey: [...queryKeys.indices.all, range, startDate],
    queryFn: async ({ signal }) => {
      let url = `/api/analises/indices?range=${range}`;
      if (startDate) {
        url += `&startDate=${startDate}`;
      }

      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error('Erro ao buscar dados de índices');
      }

      const data = await response.json();
      return data.indices || [];
    },
  });

  return {
    indices,
    loading,
    error: queryError ? (queryError as Error).message : null,
    refetch: () => void queryRefetch(),
  };
};
