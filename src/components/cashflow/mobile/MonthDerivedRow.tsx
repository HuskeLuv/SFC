'use client';

import React from 'react';
import type { MonthDerived } from '@/lib/cashflow/monthViewModel';
import { formatBRL, formatPct } from '@/utils/format';
import { signClass } from './MonthSummaryCard';

/**
 * Linha CALCULADA da visão do mês (Saldo do mês, índices, Fluxo livre, Evolução…), no lugar em que
 * aparece na planilha. Fundo cinza com ícone de calculadora; as linhas-chave ganham o tint
 * tranquilidade. Tocar abre o DerivedInfoSheet com a explicação da conta (só leitura).
 */

export function formatDerived(value: number | null, format: MonthDerived['format']): string {
  if (value === null) return '–';
  return format === 'percent' ? formatPct(value) : formatBRL(value);
}

export const CalcIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
    <path
      d="M8 7h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export interface MonthDerivedRowProps {
  row: MonthDerived;
  onOpen: (row: MonthDerived) => void;
  /** Linha sozinha (com borda e cantos próprios) em vez de dentro de um grupo de calculadas. */
  single?: boolean;
}

function MonthDerivedRowComponent({ row, onOpen, single = false }: MonthDerivedRowProps) {
  const text = formatDerived(row.value, row.format);
  const color = row.format === 'currency' ? signClass(row.value) : '';
  return (
    <button
      type="button"
      data-mf-fluxo-derived={row.key}
      aria-haspopup="dialog"
      aria-label={`${row.label}, ${text === '–' ? 'sem cálculo' : text}, calculado, ver a conta`}
      onClick={() => onOpen(row)}
      className={`grid min-h-[52px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 px-3.5 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0079F2] ${
        row.emphasis
          ? // Tint leve + barra: com o tint de 22% do protótipo o vermelho/azul reprovam no AA.
            'bg-mf-tranquilidade/[0.06] text-mf-potencia shadow-[inset_4px_0_0_#6E9DC4] dark:bg-[#1C2A40] dark:text-gray-100'
          : 'bg-gray-50 text-gray-800 dark:bg-[#26262A] dark:text-white/90'
      } ${
        single
          ? 'rounded-[14px] border border-gray-200 dark:border-gray-800'
          : 'border-t border-gray-200 first:border-t-0 dark:border-gray-800'
      }`}
    >
      <span
        className={`flex min-w-0 items-center gap-1.5 text-sm ${row.emphasis ? 'font-semibold' : 'font-medium'}`}
      >
        <span className="shrink-0 text-gray-500 dark:text-gray-400">
          <CalcIcon />
        </span>
        <span className="truncate">{row.label}</span>
      </span>
      <span
        className={`text-[15px] font-semibold whitespace-nowrap tabular-nums ${color}`}
        aria-hidden="true"
      >
        {text}
      </span>
    </button>
  );
}

export const MonthDerivedRow = React.memo(MonthDerivedRowComponent);

/** Grupo de linhas calculadas seguidas (um cartão). */
export function MonthDerivedGroup({
  rows,
  onOpen,
}: {
  rows: MonthDerived[];
  onOpen: (row: MonthDerived) => void;
}) {
  if (rows.length === 1) return <MonthDerivedRow row={rows[0]} onOpen={onOpen} single />;
  return (
    <div className="flex flex-col overflow-hidden rounded-[14px] border border-gray-200 dark:border-gray-800">
      {rows.map((row) => (
        <MonthDerivedRow key={row.key} row={row} onOpen={onOpen} />
      ))}
    </div>
  );
}

export default MonthDerivedRow;
