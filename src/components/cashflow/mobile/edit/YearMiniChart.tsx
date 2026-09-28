'use client';

import React from 'react';
import { twMerge } from 'tailwind-merge';
import { formatBRL } from '@/utils/format';
import { MONTH_NAMES } from '@/components/cashflow/mobile/MonthStepper';

/**
 * Gráfico do ano da linha no sheet da célula (PWA fase 2): 12 barras simples (sem Apex) com os
 * totais de cada mês, o mês aberto destacado (borda #0079F2, elemento não textual). O resumo vai no
 * `aria-label`; as barras são decorativas.
 */

export interface YearMiniChartProps {
  /** Nome da linha (título do gráfico). */
  name: string;
  year: number;
  /** 12 valores (Jan..Dez). */
  values: number[];
  /** Mês em destaque (0..11). */
  month: number;
}

const INITIALS = MONTH_NAMES.map((m) => m[0]);

export function YearMiniChart({ name, year, values, month }: YearMiniChartProps) {
  const series = Array.from({ length: 12 }, (_, i) => values[i] ?? 0);
  const total = series.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...series.map((v) => Math.abs(v)));
  const filled = series.filter((v) => v !== 0).length;
  const summary = `${name} em ${year}: ${MONTH_NAMES[month]} ${formatBRL(series[month])}; no ano ${formatBRL(total)}, ${filled} ${filled === 1 ? 'mês preenchido' : 'meses preenchidos'}.`;

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        {name} em {year}
      </p>
      <div role="img" aria-label={summary}>
        <div className="grid h-10 grid-cols-12 items-end gap-[3px]" aria-hidden="true">
          {series.map((v, i) => (
            <span
              key={i}
              className={twMerge(
                'block min-h-[2px] rounded-t-[3px]',
                i === month
                  ? 'bg-mf-patrimonio outline outline-2 outline-offset-1 outline-[#0079F2] dark:bg-mf-tranquilidade'
                  : v < 0
                    ? 'bg-[#D92D20]/45 dark:bg-[#F97066]/45'
                    : 'bg-mf-tranquilidade/55 dark:bg-mf-tranquilidade/35',
              )}
              style={{ height: `${Math.max(v === 0 ? 4 : 8, (Math.abs(v) / max) * 100)}%` }}
            />
          ))}
        </div>
        <div
          className="mt-1 grid grid-cols-12 gap-[3px] text-center text-[10px] text-gray-500 dark:text-gray-400"
          aria-hidden="true"
        >
          {INITIALS.map((l, i) => (
            <span
              key={i}
              className={i === month ? 'font-bold text-gray-800 dark:text-white/90' : ''}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-gray-500 tabular-nums dark:text-gray-400">
        No ano {formatBRL(total)} · média {formatBRL(total / 12)} por mês
      </p>
    </div>
  );
}

export default YearMiniChart;
