'use client';

import React, { useId, useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { CASHFLOW_COLOR_LEGEND, type CashflowColorValue } from '@/utils/cashflowColorLegend';

/**
 * Situação (cor) da célula no sheet do celular (PWA fase 2): radiogroup em 2 colunas de 44px com
 * "Sem cor" + as 5 cores da legenda (`CASHFLOW_COLOR_LEGEND`). A cor escolhida pelo usuário só
 * aparece no PONTO (com anel), o rótulo em texto normal. Quem usa grava o `cssColor` hex, como o
 * desktop; o valor marcado vem de `normalizeCellColor` (aceita o token antigo 'red'/'green').
 */

export interface SituacaoPickerProps {
  value: CashflowColorValue | null;
  onChange: (value: CashflowColorValue | null) => void;
  disabled?: boolean;
}

const OPTIONS: ReadonlyArray<{ value: CashflowColorValue | null; label: string; css?: string }> = [
  { value: null, label: 'Sem cor' },
  ...CASHFLOW_COLOR_LEGEND.map((e) => ({ value: e.value, label: e.label, css: e.cssColor })),
];

export function SituacaoPicker({ value, onChange, disabled }: SituacaoPickerProps) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === value),
  );

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <span
        id={labelId}
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Situação
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-1.5">
        {OPTIONS.map((option, i) => {
          const checked = i === selectedIndex;
          return (
            <button
              key={option.label}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={twMerge(
                'flex min-h-11 items-center gap-2 rounded-xl border px-2.5 text-left text-[13.5px] text-gray-800 outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]/40 disabled:opacity-60 dark:text-white/90',
                checked
                  ? 'border-mf-patrimonio font-semibold shadow-[inset_0_0_0_1px_var(--color-mf-patrimonio)] dark:border-mf-tranquilidade dark:shadow-[inset_0_0_0_1px_var(--color-mf-tranquilidade)]'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900',
              )}
            >
              {option.css ? (
                <span
                  className="h-[9px] w-[9px] shrink-0 rounded-full shadow-[0_0_0_1.5px_#fff,0_0_0_2.5px_#98A2B3] dark:shadow-[0_0_0_1.5px_#111827,0_0_0_2.5px_#667085]"
                  style={{ backgroundColor: option.css }}
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px] border-dashed border-gray-400"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SituacaoPicker;
