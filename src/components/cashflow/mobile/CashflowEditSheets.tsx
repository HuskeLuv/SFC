'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useCashflowMutations } from '@/hooks/useCashflowMutations';
import { findItemById } from '@/utils/cashflowHelpers';
import { findGroupInTree } from '@/services/cashflow/reorderItemsInTree';
import { getItemCapabilities, groupDisplayName } from '@/lib/cashflow/itemCapabilities';
import { MONTH_NAMES } from '@/components/cashflow/mobile/MonthStepper';
import { allowedView, CellSheet, type CellView } from './edit/CellSheet';
import { GroupSheet } from './edit/GroupSheet';
import { AddItemSheet } from './edit/AddItemSheet';
import { ICONS, SheetFooterProvider } from './edit/sheetUi';

/**
 * Sheets de edição do Fluxo de caixa no celular (PWA fase 2, fatia B; protótipo cenários c, d e e).
 *
 * UM BottomSheet que troca de painel por dentro (nunca empilha): célula (valor + fórmula,
 * situação, comentário, gráfico do ano, renomear/porquê/nível, mover, excluir), ações do grupo e
 * nova linha. Toda gravação passa pelo `useCashflowMutations` — as MESMAS rotas, corpos e
 * invalidações da planilha de desktop — e respeita `getItemCapabilities`.
 *
 * Falha (HTTP, exceção ou `results[i].success=false` do batch-update) = o sheet fica aberto com o
 * que foi digitado e a mensagem em role=alert. Sucesso = fecha e chama `onSaved` (aviso "Salvo"
 * SEM Desfazer: o histórico não sabe desfazer essas ações).
 *
 * O alvo leva só ids: a cada render o sheet re-resolve item/grupo contra `groups`; se o id sumiu
 * (refetch, personalização trocou o id), o sheet fecha.
 */

export type CashflowEditTarget =
  | {
      kind: 'cell';
      itemId: string;
      groupId: string;
      /** 0 = Jan … 11 = Dez. */
      month: number;
      view?: 'valor' | 'comentario' | 'linha' | 'mover' | 'excluir';
    }
  | { kind: 'group'; groupId: string; month: number }
  | { kind: 'add-item'; groupId: string; month: number };

export interface CashflowEditSheetsProps {
  year: number;
  groups: CashflowGroup[];
  /** Totais por mês de cada item (processedData.itemTotals), por id. */
  itemTotals: Record<string, number[]>;
  target: CashflowEditTarget | null;
  onTargetChange(t: CashflowEditTarget | null): void;
  /** Aviso "Salvo" (sem Desfazer) e, se houver, a linha/mês para piscar. */
  onSaved(message: string, opts?: { itemId?: string; month?: number }): void;
  /** Entra no modo "Reordenar linhas" do grupo (setas). */
  onStartReorder(groupId: string): void;
}

type Resolved =
  | { kind: 'cell'; item: CashflowItem; group: CashflowGroup }
  | { kind: 'group' | 'add-item'; group: CashflowGroup };

/** Item/grupo do alvo na árvore atual; `null` = sumiu (o sheet fecha). */
export function resolveEditTarget(
  groups: CashflowGroup[],
  target: CashflowEditTarget | null,
): Resolved | null {
  if (!target) return null;
  if (target.kind === 'cell') {
    const item = findItemById(groups, target.itemId);
    if (!item) return null;
    const group =
      (item.groupId ? findGroupInTree(groups, item.groupId) : null) ??
      findGroupInTree(groups, target.groupId);
    return group ? { kind: 'cell', item, group } : null;
  }
  const group = findGroupInTree(groups, target.groupId);
  return group ? { kind: target.kind, group } : null;
}

const CELL_TITLES: Record<Exclude<CellView, 'valor'>, string> = {
  comentario: 'Comentário',
  linha: 'Renomear e porquê',
  mover: 'Mover linha',
  excluir: 'Excluir linha',
};

export default function CashflowEditSheets({
  year,
  groups,
  itemTotals,
  target,
  onTargetChange,
  onSaved,
  onStartReorder,
}: CashflowEditSheetsProps) {
  const mutations = useCashflowMutations(year);
  const [busy, setBusy] = useState(false);
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  const resolved = useMemo(() => resolveEditTarget(groups, target), [groups, target]);

  // O id sumiu da árvore (excluída, personalizada com id novo, ano trocado): fecha.
  useEffect(() => {
    if (target && !resolved) onTargetChange(null);
  }, [target, resolved, onTargetChange]);

  // Sheet fechado = nada em andamento.
  useEffect(() => {
    if (!target) setBusy(false);
  }, [target]);

  const caps =
    resolved?.kind === 'cell' ? getItemCapabilities(resolved.item, resolved.group) : null;
  const cellView: CellView | null =
    target?.kind === 'cell' && caps ? allowedView(target.view, caps) : null;

  const close = useCallback(() => onTargetChange(null), [onTargetChange]);
  const handleClose = useCallback(() => {
    if (busy) return;
    close();
  }, [busy, close]);

  // "Voltar" do painel: da ação da linha para o valor; da nova linha para o grupo.
  const back = useMemo(() => {
    if (!target) return null;
    if (target.kind === 'cell' && cellView && cellView !== 'valor') {
      return () => onTargetChange({ ...target, view: 'valor' });
    }
    if (target.kind === 'add-item') {
      return () => onTargetChange({ kind: 'group', groupId: target.groupId, month: target.month });
    }
    return null;
  }, [target, cellView, onTargetChange]);

  // Esc num painel de ação volta um passo (não fecha o sheet). Captura na janela: roda antes do
  // Esc do BottomSheet (listener no document).
  useEffect(() => {
    if (!back) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (busyRef.current) {
        // Gravando: o Esc não volta nem fecha (o BottomSheet também ignora).
        event.stopPropagation();
        return;
      }
      const sheet = contentRef.current?.closest('[data-mf-sheet]');
      if (!sheet) return;
      const t = event.target as Node | null;
      if (t && t !== document.body && !sheet.contains(t)) return;
      event.preventDefault();
      event.stopPropagation();
      back();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [back]);

  if (!target || !resolved) return null;

  let title: string;
  let content: React.ReactNode;
  let hasFooter = true;

  if (resolved.kind === 'cell' && target.kind === 'cell' && caps && cellView) {
    const { item, group } = resolved;
    title = cellView === 'valor' ? item.name : CELL_TITLES[cellView];
    hasFooter = cellView !== 'valor' || caps.editValues;
    const values =
      itemTotals[item.id] ??
      Array.from({ length: 12 }, (_, m) => item.values?.find((v) => v.month === m)?.value ?? 0);
    content = (
      <CellSheet
        key={`${item.id}:${target.month}`}
        year={year}
        month={target.month}
        item={item}
        group={group}
        groupLabel={`${MONTH_NAMES[target.month]}/${year} · ${groupDisplayName(group)}`}
        groups={groups}
        caps={caps}
        values={values}
        view={cellView}
        mutations={mutations}
        goTo={(view) => onTargetChange({ ...target, view })}
        close={close}
        onSaved={onSaved}
        setBusy={setBusy}
      />
    );
  } else if (resolved.kind === 'group') {
    title = groupDisplayName(resolved.group);
    hasFooter = false;
    content = (
      <GroupSheet
        month={target.month}
        group={resolved.group}
        groups={groups}
        onAddItem={() =>
          onTargetChange({ kind: 'add-item', groupId: resolved.group.id, month: target.month })
        }
        onStartReorder={() => {
          onStartReorder(resolved.group.id);
          close();
        }}
      />
    );
  } else {
    const group = resolved.group;
    title = 'Nova linha';
    content = (
      <AddItemSheet
        key={group.id}
        group={group}
        mutations={mutations}
        setBusy={setBusy}
        onBack={() => onTargetChange({ kind: 'group', groupId: group.id, month: target.month })}
        onCreated={(created) => {
          onSaved('Linha adicionada', { itemId: created.id, month: target.month });
          onTargetChange({
            kind: 'cell',
            itemId: created.id,
            groupId: created.groupId || group.id,
            month: target.month,
          });
        }}
      />
    );
  }

  return (
    <BottomSheet
      isOpen
      onClose={handleClose}
      title={title}
      titleAdornment={
        back ? (
          <button
            type="button"
            onClick={back}
            disabled={busy}
            aria-label="Voltar"
            className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:active:bg-white/5"
          >
            {ICONS.back}
          </button>
        ) : undefined
      }
      footer={hasFooter ? <div ref={setFooterEl} data-mf-sheet-footer="" /> : undefined}
    >
      <SheetFooterProvider value={hasFooter ? footerEl : null}>
        <div ref={contentRef} data-mf-fluxo-edit="">
          {content}
        </div>
      </SheetFooterProvider>
    </BottomSheet>
  );
}

export { CashflowEditSheets };
