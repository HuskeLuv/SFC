'use client';

import React from 'react';
import type { MonthDerived, MonthGroup, MonthItem } from '@/lib/cashflow/monthViewModel';
import MonthGroupBand from './MonthGroupBand';
import { MonthItemRow } from './MonthItemRow';
import { MonthDerivedRow } from './MonthDerivedRow';

/**
 * Um grupo da visão do mês, recursivo: faixa (nível 1/2/3), linhas calculadas presas à faixa
 * (Inflação Pedro), subgrupos e as linhas do próprio grupo — na ordem do desktop.
 *
 * Decisão 1 do Wellington: linhas SEM valor no mês ficam escondidas atrás de "Mostrar N linhas sem
 * valor" (por grupo). No modo "Reordenar linhas" do grupo, todas aparecem com ↑/↓.
 */

export interface MonthSectionContext {
  collapsed: Record<string, boolean>;
  onToggleCollapse: (groupId: string) => void;
  showAnnual: boolean;
  /** Grupos com as linhas sem valor à mostra. */
  showEmpty: Record<string, boolean>;
  onToggleShowEmpty: (groupId: string) => void;
  reorderGroupId: string | null;
  onMoveItem: (groupId: string, itemId: string, neighborId: string) => void;
  onOpenItem: (item: MonthItem) => void;
  onGroupActions: (groupId: string) => void;
  onOpenDerived: (row: MonthDerived) => void;
}

export const groupContentId = (groupId: string) => `mf-fluxo-g-${groupId}`;

const ArrowIcon = ({ up }: { up: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d={up ? 'M12 19V5m0 0l-6 6m6-6l6 6' : 'M12 5v14m0 0l-6-6m6 6l6-6'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const REORDER_BTN =
  'grid h-11 w-11 place-items-center rounded-xl border border-gray-200 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200';

function ReorderRow({
  item,
  prevId,
  nextId,
  onMove,
}: {
  item: MonthItem;
  prevId: string | null;
  nextId: string | null;
  onMove: (itemId: string, neighborId: string) => void;
}) {
  return (
    <div
      data-mf-fluxo-reorder-row=""
      data-item-id={item.itemId}
      className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-gray-100 py-1.5 pr-2 pl-3.5 first:border-t-0 dark:border-gray-800"
    >
      <span className="line-clamp-2 min-w-0 text-[14.5px] font-medium text-gray-800 dark:text-white/90">
        {item.name}
      </span>
      <span className="flex gap-1">
        <button
          type="button"
          aria-label={`Subir ${item.name}`}
          disabled={!prevId}
          onClick={() => prevId && onMove(item.itemId, prevId)}
          className={REORDER_BTN}
        >
          <ArrowIcon up />
        </button>
        <button
          type="button"
          aria-label={`Descer ${item.name}`}
          disabled={!nextId}
          onClick={() => nextId && onMove(item.itemId, nextId)}
          className={REORDER_BTN}
        >
          <ArrowIcon up={false} />
        </button>
      </span>
    </div>
  );
}

function ItemsList({ group, ctx }: { group: MonthGroup; ctx: MonthSectionContext }) {
  const { items } = group;
  if (ctx.reorderGroupId === group.groupId) {
    return (
      <>
        {items.map((item, i) => (
          <ReorderRow
            key={item.itemId}
            item={item}
            prevId={items[i - 1]?.itemId ?? null}
            nextId={items[i + 1]?.itemId ?? null}
            onMove={(id, neighbor) => ctx.onMoveItem(group.groupId, id, neighbor)}
          />
        ))}
      </>
    );
  }
  const emptyCount = items.filter((i) => !i.monthValue).length;
  const showingEmpty = !!ctx.showEmpty[group.groupId];
  const visible = showingEmpty ? items : items.filter((i) => i.monthValue);
  return (
    <>
      {visible.map((item) => (
        <MonthItemRow
          key={item.itemId}
          item={item}
          showAnnual={ctx.showAnnual}
          onOpen={ctx.onOpenItem}
        />
      ))}
      {emptyCount > 0 ? (
        <button
          type="button"
          data-mf-fluxo-show-empty={group.groupId}
          aria-expanded={showingEmpty}
          onClick={() => ctx.onToggleShowEmpty(group.groupId)}
          className={`flex min-h-11 w-full items-center justify-center px-3.5 text-[13.5px] font-medium text-mf-patrimonio active:bg-gray-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0079F2] dark:text-mf-tranquilidade dark:active:bg-white/5 ${
            visible.length ? 'border-t border-gray-100 dark:border-gray-800' : ''
          }`}
        >
          {showingEmpty
            ? 'Esconder linhas sem valor'
            : `Mostrar ${emptyCount} ${emptyCount === 1 ? 'linha' : 'linhas'} sem valor`}
        </button>
      ) : null}
      {items.length === 0 ? (
        <p className="px-3.5 py-3 text-[13px] text-gray-500 dark:text-gray-400">
          Nenhuma linha neste grupo.
        </p>
      ) : null}
    </>
  );
}

const CARD =
  'overflow-hidden rounded-[14px] border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]';

function MonthGroupSectionComponent({
  group,
  ctx,
}: {
  group: MonthGroup;
  ctx: MonthSectionContext;
}) {
  const expanded = !ctx.collapsed[group.groupId];
  const contentId = groupContentId(group.groupId);
  const hasOwnRows = group.items.length > 0 || group.children.length === 0;
  const onActions =
    !group.readOnly && hasOwnRows ? () => ctx.onGroupActions(group.groupId) : undefined;
  const band = (
    <MonthGroupBand
      group={group}
      expanded={expanded}
      onToggle={() => ctx.onToggleCollapse(group.groupId)}
      contentId={contentId}
      showAnnual={ctx.showAnnual}
      onActions={onActions}
    />
  );

  if (group.level === 3) {
    return (
      <div data-mf-fluxo-group={group.groupId} className={CARD}>
        {band}
        {expanded ? (
          <div id={contentId}>
            {group.children.map((child) => (
              <div key={child.groupId} className="p-2">
                <MonthGroupSection group={child} ctx={ctx} />
              </div>
            ))}
            <ItemsList group={group} ctx={ctx} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div data-mf-fluxo-group={group.groupId} className="flex flex-col gap-3">
      {band}
      {group.afterBand.map((row) => (
        <MonthDerivedRow key={row.key} row={row} onOpen={ctx.onOpenDerived} single />
      ))}
      {expanded ? (
        <div id={contentId} className="flex flex-col gap-3">
          {group.children.map((child) => (
            <MonthGroupSection key={child.groupId} group={child} ctx={ctx} />
          ))}
          {hasOwnRows ? (
            <div className={CARD}>
              <ItemsList group={group} ctx={ctx} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const MonthGroupSection = React.memo(MonthGroupSectionComponent);
export default MonthGroupSection;
