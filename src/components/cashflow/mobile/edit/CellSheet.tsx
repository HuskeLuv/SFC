'use client';

import React, { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import type { CashflowMutations } from '@/hooks/useCashflowMutations';
import type { CashflowColorValue } from '@/utils/cashflowColorLegend';
import type { ItemCapabilities } from '@/lib/cashflow/itemCapabilities';
import { CellValuePanel, initialCellText } from './CellValuePanel';
import { CommentPanel } from './CommentPanel';
import { ItemDetailsPanel } from './ItemDetailsPanel';
import { MovePanel } from './MovePanel';
import { DeletePanel } from './DeletePanel';

/**
 * Conteúdo do sheet da célula (PWA fase 2): troca de painel DENTRO do mesmo BottomSheet (nunca
 * empilha) — valor (padrão), comentário, renomear/porquê/nível, mover e excluir. O rascunho do
 * valor/situação vive aqui, para "Voltar" de um painel não perder o que foi digitado.
 */

export type CellView = 'valor' | 'comentario' | 'linha' | 'mover' | 'excluir';

export interface CellDraft {
  text: string;
  /** Situação escolhida; `undefined` = o usuário não mexeu (mantém a cor original como está). */
  color: CashflowColorValue | null | undefined;
}

export interface CellPanelProps {
  year: number;
  month: number;
  item: CashflowItem;
  group: CashflowGroup;
  /** '{Mês}/{ano} · {grupo}'. */
  groupLabel: string;
  groups: CashflowGroup[];
  caps: ItemCapabilities;
  /** Totais dos 12 meses da linha. */
  values: number[];
  draft: CellDraft;
  setDraft: Dispatch<SetStateAction<CellDraft>>;
  mutations: CashflowMutations;
  /** Troca de painel (Voltar = 'valor'). */
  goTo(view: CellView): void;
  /** Fecha o sheet. */
  close(): void;
  onSaved(message: string, opts?: { itemId?: string; month?: number }): void;
  /** Gravação em andamento: o sheet não fecha no toque do fundo/Esc. */
  setBusy(busy: boolean): void;
}

/** A view pedida, se a linha permite; senão o painel do valor. */
export function allowedView(view: CellView | undefined, caps: ItemCapabilities): CellView {
  switch (view) {
    case 'comentario':
      return caps.canComment ? view : 'valor';
    case 'linha':
      return caps.editStructure ? view : 'valor';
    case 'mover':
      return caps.canMove ? view : 'valor';
    case 'excluir':
      return caps.canDelete ? view : 'valor';
    default:
      return 'valor';
  }
}

export type CellSheetProps = Omit<CellPanelProps, 'draft' | 'setDraft'> & { view: CellView };

export function CellSheet(props: CellSheetProps) {
  const { item, month, view } = props;
  const [draft, setDraft] = useState<CellDraft>(() => ({
    text: initialCellText(item.values?.find((v) => v.month === month)),
    color: undefined,
  }));
  // O campo do valor só pega o foco (e abre o teclado) na abertura do sheet, não ao Voltar.
  const [autoFocusValue, setAutoFocusValue] = useState(view === 'valor');
  useEffect(() => {
    if (view !== 'valor') setAutoFocusValue(false);
  }, [view]);
  const panelProps: CellPanelProps = { ...props, draft, setDraft };

  switch (view) {
    case 'comentario':
      return <CommentPanel {...panelProps} />;
    case 'linha':
      return <ItemDetailsPanel {...panelProps} />;
    case 'mover':
      return <MovePanel {...panelProps} />;
    case 'excluir':
      return <DeletePanel {...panelProps} />;
    default:
      return <CellValuePanel {...panelProps} autoFocusField={autoFocusValue} />;
  }
}

export default CellSheet;
