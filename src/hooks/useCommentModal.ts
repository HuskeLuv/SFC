import { logger } from '@/lib/logger';
import { useCallback, useEffect, useState } from 'react';
import type { CashflowGroup } from '@/types/cashflow';
import { findItemById } from '@/utils/cashflowHelpers';

/**
 * Estado e handlers do modal de comentários por célula da planilha de fluxo
 * de caixa (extraído de DataTableTwo). O "modo comentário" em si vive no
 * useGroupEditMode (UIMode unificado) — este hook recebe os controles.
 */

export interface CommentModalState {
  isOpen: boolean;
  itemId: string | null;
  itemName: string;
  month: number;
  year: number;
  initialComment: string | null;
  updatedAt: Date | null;
}

interface UseCommentModalParams {
  groups: CashflowGroup[];
  currentYear: number;
  isCommentModeActive: boolean;
  setIsCommentModeActive: (updater: boolean | ((prev: boolean) => boolean)) => void;
  showAlert: (type: 'success' | 'error', title: string, message: string) => void;
  refetch: () => Promise<void>;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export function useCommentModal({
  groups,
  currentYear,
  isCommentModeActive,
  setIsCommentModeActive,
  showAlert,
  refetch,
  csrfFetch,
}: UseCommentModalParams) {
  const [commentModal, setCommentModal] = useState<CommentModalState>({
    isOpen: false,
    itemId: null,
    itemName: '',
    month: 0,
    year: currentYear,
    initialComment: null,
    updatedAt: null,
  });

  // Reset comment modal on unmount
  useEffect(() => {
    return () => {
      setCommentModal((prev) => ({ ...prev, isOpen: false }));
    };
  }, []);

  const closeCommentModal = useCallback(() => {
    setCommentModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const fetchComment = useCallback(async (itemId: string, month: number, year: number) => {
    const response = await fetch(
      `/api/cashflow/comments?itemId=${itemId}&month=${month}&year=${year}`,
      {
        credentials: 'include',
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro ao buscar comentário' }));
      if (response.status === 401) {
        throw new Error('Sessão inválida');
      }
      throw new Error(errorData.error || 'Erro ao buscar comentário');
    }
    const data = await response.json();
    return {
      comment: data.comment || null,
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    };
  }, []);

  // setIsCommentModeActive already clears color mode via unified UIMode
  const handleCommentButtonClick = useCallback(() => {
    setIsCommentModeActive((prev: boolean) => !prev);
  }, [setIsCommentModeActive]);

  const handleCommentCellClick = useCallback(
    async (itemId: string, monthIndex: number) => {
      if (!isCommentModeActive) return;

      try {
        const item = findItemById(groups, itemId);
        if (!item) {
          logger.warn(`Item não encontrado: ${itemId}`);
          showAlert(
            'error',
            'Item não encontrado',
            'Não foi possível encontrar o item selecionado.',
          );
          return;
        }

        const { comment, updatedAt } = await fetchComment(itemId, monthIndex, currentYear);

        setCommentModal({
          isOpen: true,
          itemId,
          itemName: item.name,
          month: monthIndex,
          year: currentYear,
          initialComment: comment,
          updatedAt,
        });

        setIsCommentModeActive(false);
      } catch (error: unknown) {
        logger.error('Erro ao buscar comentário:', error);
        if (error instanceof Error && error.message.includes('Sessão inválida')) {
          showAlert(
            'error',
            'Sessão inválida',
            'Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente.',
          );
        } else {
          showAlert('error', 'Erro', 'Erro ao abrir comentário. Tente novamente.');
        }
        setIsCommentModeActive(false);
      }
    },
    [isCommentModeActive, groups, fetchComment, setIsCommentModeActive, showAlert, currentYear],
  );

  const handleSaveComment = useCallback(
    async (comment: string) => {
      if (!commentModal.itemId) return;

      try {
        const response = await csrfFetch('/api/cashflow/comments', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            itemId: commentModal.itemId,
            month: commentModal.month,
            year: commentModal.year,
            comment: comment.trim() || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Erro ao salvar comentário' }));

          if (response.status === 401) {
            showAlert(
              'error',
              'Sessão inválida',
              errorData.error ||
                'Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente.',
            );
            throw new Error('Sessão inválida');
          }

          throw new Error(errorData.error || 'Erro ao salvar comentário');
        }

        // O PATCH pode personalizar o item (id novo no backend) — refetch é o
        // caminho seguro para o indicador refletir a célula certa.
        await refetch();
        showAlert('success', 'Comentário salvo', 'O comentário foi salvo com sucesso.');
      } catch (error: unknown) {
        logger.error('Erro ao salvar comentário:', error);

        if (error instanceof Error && error.message === 'Sessão inválida') {
          throw error;
        }

        showAlert(
          'error',
          'Erro ao salvar',
          (error instanceof Error ? error.message : undefined) ||
            'Erro ao salvar o comentário. Tente novamente.',
        );
        throw error;
      }
    },
    [commentModal, refetch, showAlert, csrfFetch],
  );

  return {
    commentModal,
    closeCommentModal,
    handleCommentButtonClick,
    handleCommentCellClick,
    handleSaveComment,
  };
}
