import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { PainelCs } from '@/services/admin/csTipos';

export type { PainelCs, ClienteCs } from '@/services/admin/csTipos';

/**
 * Painel de CS (/admin/cs). Só role admin; a API responde 403 para os demais e
 * o hook expõe isso como `forbidden`.
 */
export const useAdminCs = () => {
  const { data, isLoading, isFetching, error, refetch } = useQuery<PainelCs>({
    queryKey: queryKeys.admin.cs(),
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof Error && err.message === 'forbidden') && count < 2,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/admin/cs', { signal, credentials: 'include' });
      if (response.status === 403) throw new Error('forbidden');
      if (!response.ok) throw new Error('Erro ao carregar o painel de CS');
      return response.json();
    },
  });

  const forbidden = error instanceof Error && error.message === 'forbidden';
  return {
    data: data ?? null,
    loading: isLoading,
    isFetching,
    forbidden,
    error: error && !forbidden ? (error as Error).message : null,
    refetch,
  };
};
