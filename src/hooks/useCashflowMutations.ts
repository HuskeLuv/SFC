import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryKeys';
import { useCsrf } from '@/hooks/useCsrf';
import { useCashflowData } from '@/hooks/useCashflow';
import { createCashflowItem } from '@/utils/cashflowUpdate';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import {
  findGroupInTree,
  insertId,
  moveItemInTree,
  reorderIds,
  reorderItemsInTree,
} from '@/services/cashflow/reorderItemsInTree';

/**
 * Mutações do fluxo de caixa (PWA fase 2), extraídas do DataTableTwo e do useCommentModal SEM
 * mudar a rede: mesmas rotas, mesmos corpos, csrfFetch e as mesmas invalidações. A planilha de
 * desktop e os sheets do celular chamam estas funções; os avisos (showAlert, toast) ficam com quem
 * chama.
 */

export interface CashflowValueChange {
  month: number;
  value: number;
  color?: string | null;
  formula?: string | null;
}

export interface CashflowItemUpdate {
  itemId: string;
  name?: string;
  significado?: string | null;
  rank?: string | null;
  values?: CashflowValueChange[];
}

/** Resultado por linha do PUT /api/cashflow/batch-update. */
export interface BatchItemResult {
  itemId: string;
  success: boolean;
  error?: string;
}

export type SaveResult =
  | { ok: true; results: BatchItemResult[] }
  | { ok: false; error: string; results?: BatchItemResult[] };

/**
 * `httpOk`: a resposta foi 2xx (é o que a planilha de desktop olha — comportamento de sempre).
 * `treeUpdated`: a resposta trouxe a árvore e ela já está no cache.
 * `ok`: além do 2xx, nenhuma linha foi recusada pelo servidor (o celular mantém o sheet aberto).
 */
export type SaveItemChangesResult = SaveResult & { httpOk: boolean; treeUpdated: boolean };

export type MoveResult = { ok: true } | { ok: false; error: string };

export interface CellComment {
  comment: string | null;
  updatedAt: Date | null;
}

const SAVE_HTTP_ERROR = 'Erro ao salvar alterações';
const ROW_REFUSED_ERROR = 'Não foi possível salvar esta linha.';
const MOVE_ERROR = 'Não foi possível mover a linha.';
const COMMENT_TIMEOUT_MS = 10000;
const SESSION_INVALID_MESSAGE =
  'Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente.';

/** Erro de uma chamada do fluxo com o status HTTP (401 = sessão inválida). */
export class CashflowRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CashflowRequestError';
    this.status = status;
  }
}

export function useCashflowMutations(year: number) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const { data, refetch } = useCashflowData(year);

  const saveItemChanges = useCallback(
    async ({
      groupId,
      updates = [],
      deletes = [],
    }: {
      groupId: string;
      updates?: CashflowItemUpdate[];
      deletes?: string[];
    }): Promise<SaveItemChangesResult> => {
      let response: Response;
      try {
        response = await csrfFetch('/api/cashflow/batch-update', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ groupId, year, updates, deletes }),
        });
      } catch (error) {
        logger.error('Erro ao salvar alterações:', error);
        return { ok: false, httpOk: false, treeUpdated: false, error: SAVE_HTTP_ERROR };
      }

      if (!response.ok) {
        return { ok: false, httpOk: false, treeUpdated: false, error: SAVE_HTTP_ERROR };
      }

      // A resposta traz a árvore mesclada pós-mutação: grava direto no cache
      // em vez de refetch bloqueante. Investimentos atualizam em background.
      const saved = (await response.json().catch(() => null)) as {
        groups?: CashflowGroup[];
        results?: BatchItemResult[];
      } | null;
      const treeUpdated = !!saved?.groups;
      if (saved?.groups) {
        queryClient.setQueryData(queryKeys.cashflow.year(year), saved.groups);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cashflow.investimentos(year),
        });
      } else {
        await refetch();
      }
      // Valores/cores editados mudam o "Real" da seção Orçamento vs Real.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cashflow.orcamento(year),
      });
      // Editar a linha-espelho de um sonho re-deriva o "Realizado" no backend;
      // invalida a query de sonhos pra a tela de Planejamento refletir na hora.
      queryClient.invalidateQueries({ queryKey: queryKeys.planejamento.all });
      queryClient.invalidateQueries({ queryKey: ['planejamento-sonhos'] });

      // O servidor responde 2xx mesmo quando recusa uma linha (dívida, sonho com ativos…):
      // só informativo — a planilha de desktop segue olhando `httpOk`.
      const results = Array.isArray(saved?.results) ? saved.results : [];
      const refused = results.find((r) => r.success === false);
      if (refused) {
        return {
          ok: false,
          httpOk: true,
          treeUpdated,
          error: refused.error ?? ROW_REFUSED_ERROR,
          results,
        };
      }
      return { ok: true, httpOk: true, treeUpdated, results };
    },
    [csrfFetch, queryClient, refetch, year],
  );

  const createItem = useCallback(
    async (
      groupId: string,
      name: string,
      significado?: string,
      opts?: { refetch?: boolean },
    ): Promise<CashflowItem> => {
      const newItem = (await createCashflowItem(groupId, name, significado)) as unknown;
      if (opts?.refetch) await refetch();
      return newItem as CashflowItem;
    },
    [refetch],
  );

  // Ao soltar `activeId` sobre `overId` no mesmo grupo, reordena o cache na hora (a planilha não
  // pisca) e manda a lista completa pro backend, que personaliza templates e grava orderIndex por
  // posição. Se falhar, o refetch devolve a ordem do servidor. `false` = falhou.
  const reorderItem = useCallback(
    async (groupId: string, activeId: string, overId: string): Promise<boolean> => {
      const group = findGroupInTree(data, groupId);
      if (!group) return true;
      const ids = reorderIds(
        (group.items ?? []).map((i) => i.id),
        activeId,
        overId,
      );
      if (!ids) return true;
      queryClient.setQueryData<CashflowGroup[]>(queryKeys.cashflow.year(year), (old) =>
        old ? reorderItemsInTree(old, groupId, ids) : old,
      );
      try {
        const res = await csrfFetch('/api/cashflow/item/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId, itemIds: ids }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
      } catch (error) {
        logger.error('Erro ao reordenar linha:', error);
        await refetch();
        return false;
      }
    },
    [data, queryClient, year, csrfFetch, refetch],
  );

  // Move a linha para outro grupo (solta numa linha ou no cabeçalho): move no cache na hora e
  // manda a lista do destino pro backend; depois refetch, porque personalizar template troca
  // ids (linha e grupo). Orçamento vs Real soma por grupo → invalida.
  const moveItem = useCallback(
    async (
      activeId: string,
      toGroupId: string,
      overId: string | null,
      after: boolean,
    ): Promise<MoveResult> => {
      const destino = findGroupInTree(data, toGroupId);
      if (!destino) return { ok: true };
      const ids = insertId(
        (destino.items ?? []).map((i) => i.id),
        activeId,
        overId,
        after,
      );
      queryClient.setQueryData<CashflowGroup[]>(queryKeys.cashflow.year(year), (old) =>
        old ? moveItemInTree(old, activeId, toGroupId, ids) : old,
      );
      try {
        const res = await csrfFetch('/api/cashflow/item/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: activeId, toGroupId, itemIds: ids }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cashflow.orcamento(year),
        });
        return { ok: true };
      } catch (error) {
        logger.error('Erro ao mover linha:', error);
        return {
          ok: false,
          error:
            error instanceof Error && !error.message.startsWith('HTTP')
              ? error.message
              : MOVE_ERROR,
        };
      } finally {
        await refetch();
      }
    },
    [data, queryClient, year, csrfFetch, refetch],
  );

  const fetchCellComment = useCallback(
    async (itemId: string, month: number): Promise<CellComment> => {
      const response = await fetch(
        `/api/cashflow/comments?itemId=${itemId}&month=${month}&year=${year}`,
        {
          credentials: 'include',
          signal: AbortSignal.timeout(COMMENT_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Erro ao buscar comentário' }));
        if (response.status === 401) {
          throw new CashflowRequestError('Sessão inválida', 401);
        }
        throw new CashflowRequestError(
          errorData.error || 'Erro ao buscar comentário',
          response.status,
        );
      }
      const body = await response.json();
      return {
        comment: body.comment || null,
        updatedAt: body.updatedAt ? new Date(body.updatedAt) : null,
      };
    },
    [year],
  );

  /**
   * Grava (ou apaga, com `null`) o comentário da célula e faz refetch — o PATCH pode personalizar
   * o item (id novo no backend). 401 → CashflowRequestError(status 401) com a mensagem do servidor.
   */
  const saveCellComment = useCallback(
    async (itemId: string, month: number, comment: string | null): Promise<void> => {
      const response = await csrfFetch('/api/cashflow/comments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, month, year, comment }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Erro ao salvar comentário' }));
        if (response.status === 401) {
          throw new CashflowRequestError(errorData.error || SESSION_INVALID_MESSAGE, 401);
        }
        throw new CashflowRequestError(
          errorData.error || 'Erro ao salvar comentário',
          response.status,
        );
      }

      await refetch();
    },
    [csrfFetch, refetch, year],
  );

  return {
    saveItemChanges,
    createItem,
    reorderItem,
    moveItem,
    fetchCellComment,
    saveCellComment,
  };
}

export type CashflowMutations = ReturnType<typeof useCashflowMutations>;
