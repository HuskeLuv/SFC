import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { ChangeSection, FieldChange } from '@/services/changeHistory/types';

export interface HistoricoAlteracaoEntry {
  id: string;
  userId: string;
  actorId: string | null;
  viaConsultant: boolean;
  section: ChangeSection;
  action: string;
  entity: string | null;
  entityId: string | null;
  entityLabel: string | null;
  changes: FieldChange[] | null;
  createdAt: string;
  /** Computado no servidor: entrada reversível e mais recente da entidade. */
  canUndo: boolean;
  /** Preenchido quando a entrada foi desfeita. */
  undoneAt: string | null;
  /** Preenchido quando ESTA entrada é um undo (id da entrada revertida). */
  revertsId: string | null;
}

interface HistoricoAlteracoesResponse {
  data: HistoricoAlteracaoEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export const useHistoricoAlteracoes = (page: number, section?: ChangeSection) => {
  const { data, isLoading, isFetching, error, refetch } = useQuery<HistoricoAlteracoesResponse>({
    queryKey: queryKeys.historicoAlteracoes.list(page, section),
    // Mantém a página anterior visível enquanto a próxima carrega — sem isso
    // cada troca de página/filtro volta pro skeleton.
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ page: String(page) });
      if (section) params.set('section', section);
      const response = await fetch(`/api/historico-alteracoes?${params}`, {
        signal,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erro ao buscar histórico de alterações');
      return response.json();
    },
  });

  return {
    entries: data?.data ?? [],
    pagination: data?.pagination ?? null,
    loading: isLoading,
    isFetching,
    error: error ? (error as Error).message : null,
    refetch: () => void refetch(),
  };
};
