import React from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { FIXED_COLUMN_BODY_STYLES } from './fixedColumns';

/**
 * Linha de resumo/indicador da planilha de fluxo de caixa (Saldo do mês,
 * Evolução do Patrimônio, índices etc.): 4 colunas fixas (rótulo + traços),
 * 12 células mensais, espaçador e total anual. Única fonte do boilerplate de
 * sticky columns compartilhado por todas as linhas calculadas.
 */

export interface SummaryRowProps {
  label: string;
  /** 12 valores mensais; null renderiza '-'. */
  cells: (number | null)[];
  /** Total anual; null renderiza '-'. */
  annual: number | null;
  format?: 'currency' | 'percent';
  /** brown: fundo #998256 texto branco (padrão); gray: fundo #D9D9D9 texto preto. */
  variant?: 'brown' | 'gray';
  /** Pinta valores negativos de vermelho (Saldo do mês, Evolução). */
  negativeRed?: boolean;
  showActionsColumn?: boolean;
}

const VARIANT = {
  brown: { bg: '#998256', text: 'text-white' },
  gray: { bg: '#D9D9D9', text: 'text-black' },
} as const;

export const SummaryRow: React.FC<SummaryRowProps> = ({
  label,
  cells,
  annual,
  format = 'currency',
  variant = 'brown',
  negativeRed = false,
  showActionsColumn = false,
}) => {
  const { bg, text } = VARIANT[variant];
  const formatValue = format === 'currency' ? formatCurrency : formatPercent;

  const valueClass = (value: number | null) =>
    negativeRed && value !== null && value < 0 ? 'text-red-600 dark:text-red-400' : text;

  const stickyCell = (index: number, content: React.ReactNode, extraClass = '') => (
    <TableCell
      className={`px-2 font-bold ${text} text-xs h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 ${extraClass}`}
      style={{
        position: 'sticky',
        backgroundColor: bg,
        ...FIXED_COLUMN_BODY_STYLES[index],
        overflow: 'hidden',
        flexShrink: 0,
        ...(index === 0 ? { borderRight: 'none' } : { borderLeft: 'none' }),
        ...(index > 0 && index < 3 ? { borderRight: 'none' } : {}),
      }}
    >
      {content}
    </TableCell>
  );

  return (
    <TableRow
      className="h-6 w-full"
      style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px', backgroundColor: bg }}
    >
      {stickyCell(0, label, 'text-left border-l')}
      {stickyCell(1, '-')}
      {stickyCell(2, '-', 'text-center')}
      {stickyCell(3, '-', 'text-right border-r border-gray-300')}
      {cells.map((value, index) => (
        <TableCell
          key={index}
          className={`px-1 font-bold border-t border-b border-gray-200 border-r border-gray-200 text-xs text-right h-6 leading-6 ${
            index === 0 ? 'border-l-0' : 'border-l border-gray-200'
          } ${valueClass(value)}`}
          style={{ minWidth: '3rem' }}
        >
          {value === null ? '-' : formatValue(value)}
        </TableCell>
      ))}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-gray-900"></TableCell>
      <TableCell
        className={`px-2 font-bold border border-gray-200 text-xs text-right h-6 leading-6 ${valueClass(annual)}`}
        style={{ minWidth: '4rem' }}
      >
        {annual === null ? '-' : formatValue(annual)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};
