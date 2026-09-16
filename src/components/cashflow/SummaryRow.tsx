import React from 'react';
import { TableRow } from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { FixedCell, MonthCell, AnnualCell } from './GridCells';
import {
  GRID,
  SUMMARY_CLASS,
  VALUE_POSITIVE_CLASS,
  VALUE_NEGATIVE_CLASS,
} from './cashflowGridStyles';

/**
 * Linha de resumo/indicador da planilha de fluxo de caixa (Saldo do mês,
 * Evolução do Patrimônio, índices etc.): rótulo nas colunas fixas, 12 células
 * mensais e Total Anual.
 */

export interface SummaryRowProps {
  label: string;
  /** Explicação da fórmula, exibida no hover do rótulo (title nativo). */
  tooltip?: string;
  /** 12 valores mensais; null renderiza '–' (não calculável). */
  cells: (number | null)[];
  /** Total anual; null renderiza '–'. */
  annual: number | null;
  format?: 'currency' | 'percent';
  /**
   * `total` (padrão): cinza-claro como as linhas de total do app.
   * `highlight`: azul claro da paleta para as linhas-chave (Saldo do mês,
   * Fluxo de Caixa livre, Evolução do Patrimônio).
   */
  variant?: keyof typeof SUMMARY_CLASS;
  /** Pinta valores negativos de vermelho (Saldo do mês, Evolução). */
  negativeRed?: boolean;
  /**
   * Pinta valores positivos de azul (pedido do Pedro, ago/2026 — convenção
   * Excel: positivo azul, negativo vermelho). Zero mantém a cor da variante.
   */
  positiveBlue?: boolean;
  /**
   * Escala de cor por faixa de valor. Retornando uma classe, ela vence
   * negativeRed/positiveBlue; null cai nas regras padrão. Passar função de
   * módulo (estável) — a linha é memoizada.
   */
  cellClass?: (value: number | null) => string | null;
}

const EMPTY = '–';

const SummaryRowComponent: React.FC<SummaryRowProps> = ({
  label,
  tooltip,
  cells,
  annual,
  format = 'currency',
  variant = 'total',
  negativeRed = false,
  positiveBlue = false,
  cellClass,
}) => {
  const bg = SUMMARY_CLASS[variant];
  const formatValue = format === 'currency' ? formatCurrency : formatPercent;

  const valueClass = (value: number | null) => {
    const custom = cellClass?.(value);
    if (custom) return custom;
    if (negativeRed && value !== null && value < 0) return VALUE_NEGATIVE_CLASS;
    if (positiveBlue && value !== null && value > 0) return VALUE_POSITIVE_CLASS;
    return '';
  };

  return (
    <TableRow className={`${GRID.row} font-medium ${bg}`}>
      <FixedCell col={0} className={`font-semibold ${bg}`} title={tooltip}>
        <span className={tooltip ? 'cursor-help' : undefined}>{label}</span>
      </FixedCell>
      <FixedCell col={1} className={bg} />
      <FixedCell col={2} className={bg} />
      <FixedCell col={3} className={bg} />
      {cells.map((value, index) => (
        <MonthCell key={index} index={index} className={valueClass(value)}>
          {value === null ? EMPTY : formatValue(value)}
        </MonthCell>
      ))}
      <AnnualCell className={`${bg} ${valueClass(annual)}`}>
        {annual === null ? EMPTY : formatValue(annual)}
      </AnnualCell>
    </TableRow>
  );
};

// Memo: as linhas de resumo recebem arrays memoizados do DataTableTwo.
export const SummaryRow = React.memo(SummaryRowComponent);
