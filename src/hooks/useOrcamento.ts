import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useCsrf } from '@/hooks/useCsrf';
import type { OrcamentoVsReal } from '@/services/cashflow/orcamentoVsReal';

/**
 * Dados da seção Orçamento vs Real do fluxo de caixa.
 *
 * O GET devolve o payload completo nos DOIS modos de leitura do real
 * (lançado/consolidado) — o toggle da UI é instantâneo, sem refetch.
 * `saveMetas` upserta/deleta metas e invalida a própria query; o "Real"
 * é invalidado por quem edita a planilha (DataTableTwo/import/undo).
 */

export interface OrcamentoPayload extends OrcamentoVsReal {
  year: number;
}

/** Meta a upsertar: groupId null = linha de investimentos. */
export interface OrcamentoMetaUpdate {
  groupId: string | null;
  valor: number;
  /** Só investimentos: 'valor' (R$/mês, default) ou 'percentual' (% da renda). */
  tipoMeta?: 'valor' | 'percentual';
}

export const useOrcamento = (year?: number) => {
  const currentYear = year ?? new Date().getFullYear();
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();

  const query = useQuery<OrcamentoPayload>({
    queryKey: queryKeys.cashflow.orcamento(currentYear),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cashflow/orcamento?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao buscar orçamento');
      return response.json();
    },
  });

  const saveMetas = useCallback(
    async ({ metas = [], deletes = [] }: { metas?: OrcamentoMetaUpdate[]; deletes?: string[] }) => {
      const response = await csrfFetch('/api/cashflow/orcamento', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: currentYear, metas, deletes }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Erro ao salvar metas do orçamento');
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.cashflow.orcamento(currentYear),
      });
    },
    [csrfFetch, queryClient, currentYear],
  );

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
    saveMetas,
  };
};
