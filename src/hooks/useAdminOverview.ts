import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { AdminOverview } from '@/services/admin/overview';

export type { AdminOverview } from '@/services/admin/overview';

/**
 * Visão consolidada do painel administrativo (/admin). Só role admin; a API
 * responde 403 para os demais e o hook expõe isso como `forbidden`.
 */
export const useAdminOverview = () => {
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery<AdminOverview>({
    queryKey: queryKeys.admin.overview(),
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof Error && err.message === 'forbidden') && count < 2,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/admin/overview', { signal, credentials: 'include' });
      if (response.status === 403) throw new Error('forbidden');
      if (!response.ok) throw new Error('Erro ao carregar o painel administrativo');
      return response.json();
    },
  });

  return {
    data: data ?? null,
    loading: isLoading,
    isFetching,
    forbidden: error instanceof Error && error.message === 'forbidden',
    error:
      error && !(error instanceof Error && error.message === 'forbidden')
        ? (error as Error).message
        : null,
    refetch,
    atualizadoEm: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
  };
};
