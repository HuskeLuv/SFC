import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { SensibilidadeCarteiraResponse } from '@/types/analises';

export function useSensibilidadeCarteira(windowMonths: number = 24) {
  const {
    data = null,
    isLoading: loading,
    error: queryError,
  } = useQuery<SensibilidadeCarteiraResponse>({
    queryKey: queryKeys.sensibilidadeCarteira.window(windowMonths),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/analises/sensibilidade-carteira?windowMonths=${windowMonths}`,
        { credentials: 'include', signal },
      );
      if (!response.ok) throw new Error('Erro ao carregar sensibilidade da carteira');
      return response.json();
    },
  });

  const error = queryError ? (queryError as Error).message : null;
  return { data, loading, error };
}
