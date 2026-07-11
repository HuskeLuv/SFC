import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { useCsrf } from '@/hooks/useCsrf';
import type { ChangeSection } from '@/services/changeHistory/types';

interface UndoResponse {
  success: true;
  section: ChangeSection;
}

/**
 * Desfaz uma entrada do histórico (POST /api/historico-alteracoes/:id/undo)
 * e invalida as caches derivadas da seção afetada — carteira usa o wipe
 * global (mesmo contrato de qualquer mutação de portfolio); planejamento
 * também invalida cashflow por causa da linha-espelho dos sonhos.
 */
export function useUndoAlteracao() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  return useMutation<UndoResponse, Error, string>({
    mutationFn: async (entryId: string) => {
      const response = await csrfFetch(`/api/historico-alteracoes/${entryId}/undo`, {
        method: 'POST',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === 'string' ? body.error : 'Erro ao desfazer a alteração',
        );
      }
      return body as UndoResponse;
    },
    onSuccess: ({ section }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.historicoAlteracoes.all });
      if (section === 'carteira') {
        invalidatePortfolioDerivedQueries(queryClient);
      } else if (section === 'fluxo-caixa') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
      } else if (section === 'planejamento') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.planejamento.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
      }
      // perfil: nenhuma cache React Query dedicada além do próprio histórico.
    },
  });
}
