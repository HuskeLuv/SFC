import { logger } from '@/lib/logger';
import { useCallback, useEffect, useState } from 'react';
import type { CashflowGroup } from '@/types/cashflow';
import { findItemById } from '@/utils/cashflowHelpers';
import { CashflowRequestError, type CellComment } from '@/hooks/useCashflowMutations';

/**
 * Estado e handlers do modal de comentários por célula da planilha de fluxo
 * de caixa (extraído de DataTableTwo). O "modo comentário" em si vive no
 * useGroupEditMode (UIMode unificado) — este hook recebe os controles. A rede (buscar/gravar o
 * comentário) vem do useCashflowMutations.
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
  /** useCashflowMutations(year).fetchCellComment — mesmo timeout e mesmos erros. */
  fetchCellComment: (itemId: string, month: number) => Promise<CellComment>;
  /** useCashflowMutations(year).saveCellComment — grava e faz refetch. */
  saveCellComment: (itemId: string, month: number, comment: string | null) => Promise<void>;
}

export function useCommentModal({
  groups,
  currentYear,
  isCommentModeActive,
  setIsCommentModeActive,
  showAlert,
  fetchCellComment,
  saveCellComment,
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

        const { comment, updatedAt } = await fetchCellComment(itemId, monthIndex);

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
    [isCommentModeActive, groups, fetchCellComment, setIsCommentModeActive, showAlert, currentYear],
  );

  const handleSaveComment = useCallback(
    async (comment: string) => {
      if (!commentModal.itemId) return;

      try {
        // O PATCH pode personalizar o item (id novo no backend) — o saveCellComment faz refetch,
        // o caminho seguro para o indicador refletir a célula certa.
        await saveCellComment(commentModal.itemId, commentModal.month, comment.trim() || null);
        showAlert('success', 'Comentário salvo', 'O comentário foi salvo com sucesso.');
      } catch (error: unknown) {
        logger.error('Erro ao salvar comentário:', error);

        if (error instanceof CashflowRequestError && error.status === 401) {
          showAlert('error', 'Sessão inválida', error.message);
          throw new Error('Sessão inválida');
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
    [commentModal, saveCellComment, showAlert],
  );

  return {
    commentModal,
    closeCommentModal,
    handleCommentButtonClick,
    handleCommentCellClick,
    handleSaveComment,
  };
}
