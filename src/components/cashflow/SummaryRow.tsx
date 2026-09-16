import React from 'react';
import { TableRow } from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { FixedCell, MonthCell, AnnualCell, SpacerCell, ActionsCell, FixedCol } from './GridCells';
import { GRID } from './cashflowGridStyles';

/**
 * Linha de resumo/indicador da planilha de fluxo de caixa (Saldo do mês,
 * Evolução do Patrimônio, índices etc.): 4 colunas fixas (rótulo + traços),
 * 12 células mensais, espaçador e total anual.
 */

export interface SummaryRowProps {
  label: string;
  /** Explicação da fórmula, exibida no hover do rótulo (title nativo). */
  tooltip?: string;
  /** 12 valores mensais; null renderiza '-'. */
  cells: (number | null)[];
  /** Total anual; null renderiza '-'. */
  annual: number | null;
  format?: 'currency' | 'percent';
  /** Cor da linha — hex exato da planilha do Pedro (mesma em light/dark). */
  variant?: keyof typeof VARIANT;
  /** Pinta valores negativos de vermelho (Saldo do mês, Evolução). */
  negativeRed?: boolean;
  /**
   * Pinta valores positivos de azul (pedido do Pedro, ago/2026 — convenção
   * Excel: positivo azul, negativo vermelho). Zero mantém a cor da variante.
   */
  positiveBlue?: boolean;
  /**
   * Escala de cor por faixa de valor (ex.: Índice de Poupança). Retornando
   * uma classe, ela vence negativeRed/positiveBlue; null cai nas regras
   * padrão. Passar função de módulo (estável) — a linha é memoizada.
   */
  cellClass?: (value: number | null) => string | null;
  showActionsColumn?: boolean;
}

const VARIANT = {
  /** (legado — Saldo do mês/Fluxo livre migraram pros cinzas da planilha, 19/08/2026) */
  brown: { bg: '#998256', text: 'text-white' },
  /** Saldo do mês, Índice de Poupança Mensal — RGB 204,204,204 da planilha */
  silver: { bg: '#CCCCCC', text: 'text-black' },
  /** Fluxo de Caixa livre (e linha Aporte/Resgate no GroupHeader) — RGB 201,204,204 */
  silverGreen: { bg: '#C9CCCC', text: 'text-black' },
  /** Inflação Pessoal */
  gray: { bg: '#D8D8D8', text: 'text-black' },
  /** Saldo Conta Corrente Mês Anterior */
  amber: { bg: '#FFC000', text: 'text-black' },
  /** Índice de Poupança Mensal */
  khaki: { bg: '#947F53', text: 'text-white' },
  /** Evolução do Patrimônio */
  blueSoft: { bg: '#8DB3E2', text: 'text-black' },
  /** Rendimentos Recebidos */
  bluePale: { bg: '#C6D9F0', text: 'text-black' },
  /** Índice paz financeira */
  gold: { bg: '#CC9900', text: 'text-black' },
} as const;

const FIXED_ALIGN: Record<FixedCol, string> = {
  0: 'text-left',
  1: '',
  2: 'text-center',
  3: 'text-right',
};

const SummaryRowComponent: React.FC<SummaryRowProps> = ({
  label,
  tooltip,
  cells,
  annual,
  format = 'currency',
  variant = 'brown',
  negativeRed = false,
  positiveBlue = false,
  cellClass,
  showActionsColumn = false,
}) => {
  const { bg, text } = VARIANT[variant];
  const formatValue = format === 'currency' ? formatCurrency : formatPercent;

  const valueClass = (value: number | null) => {
    const custom = cellClass?.(value);
    if (custom) return custom;
    if (negativeRed && value !== null && value < 0) return 'text-red-600 dark:text-red-400';
    if (positiveBlue && value !== null && value > 0) return 'text-blue-600 dark:text-blue-300';
    return text;
  };

  const fixedCell = (col: FixedCol, content: React.ReactNode) => (
    <FixedCell
      col={col}
      frame="framed"
      className={`font-bold ${text} ${FIXED_ALIGN[col]}`}
      style={{ backgroundColor: bg }}
    >
      {content}
    </FixedCell>
  );

  return (
    <TableRow className={`${GRID.row} w-full`} style={{ ...GRID.rowStyle, backgroundColor: bg }}>
      {fixedCell(
        0,
        tooltip ? (
          <span title={tooltip} className="cursor-help">
            {label}
          </span>
        ) : (
          label
        ),
      )}
      {fixedCell(1, '-')}
      {fixedCell(2, '-')}
      {fixedCell(3, '-')}
      {cells.map((value, index) => (
        <MonthCell key={index} index={index} variant="bold" className={valueClass(value)}>
          {value === null ? '-' : formatValue(value)}
        </MonthCell>
      ))}
      <SpacerCell />
      <AnnualCell variant="bold" className={valueClass(annual)}>
        {annual === null ? '-' : formatValue(annual)}
      </AnnualCell>
      {showActionsColumn && <ActionsCell />}
    </TableRow>
  );
};

// Memo: as linhas de resumo recebem arrays memoizados do DataTableTwo.
export const SummaryRow = React.memo(SummaryRowComponent);
