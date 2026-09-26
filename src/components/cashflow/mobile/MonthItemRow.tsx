'use client';

import React from 'react';
import { cashflowColorCss } from '@/utils/cashflowColorLegend';
import type { MonthItem } from '@/lib/cashflow/monthViewModel';
import { formatBRL } from '@/utils/format';

/**
 * Uma linha do fluxo na visão do mês (PWA fase 2). Botão inteiro (mín. 52px) que abre o sheet da
 * célula (fatia B) — também nas linhas de Aporte/Resgate, que abrem em modo leitura.
 *
 * Situação da célula = PONTO de 9px na cor exata da legenda (decisão 2 do Wellington), com anel e
 * o nome no `aria-label`; o valor fica na cor neutra (vermelho semântico só para negativo).
 */

export interface MonthItemRowProps {
  item: MonthItem;
  /** Total do ano embaixo do valor ("ano R$ X"). */
  showAnnual: boolean;
  onOpen: (item: MonthItem) => void;
}

const CommentIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 5h16v11H9l-5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

function MonthItemRowComponent({ item, showAnnual, onOpen }: MonthItemRowProps) {
  const hasValue = item.monthValue !== 0;
  const negative = item.monthValue < 0;
  return (
    <button
      type="button"
      data-mf-fluxo-row=""
      data-item-id={item.itemId}
      onClick={() => onOpen(item)}
      className="grid min-h-[52px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 border-t border-gray-100 px-3.5 py-2 text-left text-gray-800 first:border-t-0 active:bg-gray-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-800 dark:text-white/90 dark:active:bg-white/5"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {item.badges.includes('sonho') ? (
          <span role="img" aria-label="vinculada a um sonho" className="shrink-0 text-[13px]">
            🎯
          </span>
        ) : null}
        {item.badges.includes('divida') ? (
          <span role="img" aria-label="vinculada a uma dívida" className="shrink-0 text-[13px]">
            💳
          </span>
        ) : null}
        <span className="line-clamp-2 min-w-0 text-[14.5px] leading-snug font-medium break-words">
          {item.name}
        </span>
        {item.hasComment ? (
          <span
            role="img"
            aria-label="com comentário"
            className="shrink-0 text-gray-500 dark:text-gray-400"
          >
            <CommentIcon />
          </span>
        ) : null}
        {item.hasFormula ? (
          <span
            role="img"
            aria-label="com fórmula"
            className="shrink-0 rounded-[5px] bg-gray-100 px-1 font-mono text-[10.5px] leading-4 font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
          >
            <span aria-hidden="true">=ƒx</span>
          </span>
        ) : null}
        {item.readOnly ? (
          <span
            role="img"
            aria-label="automático, só leitura"
            className="shrink-0 text-gray-500 dark:text-gray-400"
          >
            <LockIcon />
          </span>
        ) : null}
      </span>

      <span className="flex flex-col items-end gap-px">
        <span
          className={`inline-flex items-center gap-[7px] text-[15px] whitespace-nowrap tabular-nums ${
            hasValue
              ? `font-semibold ${negative ? 'text-[#D92D20] dark:text-[#F97066]' : 'text-gray-800 dark:text-white/90'}`
              : 'font-medium text-gray-500 dark:text-gray-400'
          }`}
        >
          {hasValue && item.colorKey ? (
            <span
              role="img"
              aria-label={item.colorLabel ?? undefined}
              data-mf-situacao={item.colorKey}
              className="h-[9px] w-[9px] shrink-0 rounded-full shadow-[0_0_0_1.5px_#fff,0_0_0_2.5px_rgba(45,45,45,0.35)] dark:shadow-[0_0_0_1.5px_#1F1F22,0_0_0_2.5px_rgba(234,234,234,0.55)]"
              style={{ backgroundColor: cashflowColorCss(item.colorKey) }}
            />
          ) : null}
          {hasValue ? (
            formatBRL(item.monthValue)
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">sem valor</span>
            </>
          )}
        </span>
        {showAnnual ? (
          <small className="text-[11.5px] whitespace-nowrap text-gray-500 tabular-nums dark:text-gray-400">
            ano {formatBRL(item.annual)}
          </small>
        ) : null}
      </span>
    </button>
  );
}

/** Memo: a lista re-renderiza por estados globais (toast, sheets); linhas estáveis são puladas. */
export const MonthItemRow = React.memo(MonthItemRowComponent);
export default MonthItemRow;
