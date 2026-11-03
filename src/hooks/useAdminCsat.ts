import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { CsatAdmin } from '@/services/admin/csat';

/** KPI de CSAT do painel de CS (ticket 86e3vmyup). Só admin; 403 vira `forbidden`. */
export const useAdminCsat = (enabled = true) => {
  const { data, isLoading, error } = useQuery<CsatAdmin>({
    queryKey: queryKeys.admin.csat(),
    enabled,
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof Error && err.message === 'forbidden') && count < 2,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/admin/csat?limite=500', {
        signal,
        credentials: 'include',
      });
      if (response.status === 403) throw new Error('forbidden');
      if (!response.ok) throw new Error('Erro ao carregar o CSAT');
      return response.json();
    },
  });
  return { data: data ?? null, loading: isLoading, error: error ? (error as Error).message : null };
};
