import React from 'react';
import { TableCell } from '@/components/ui/table';
import { FIXED_COLUMN_BODY_STYLES, FIXED_COLUMN_HEADER_STYLES } from './fixedColumns';
import { GRID, FIXED_FRAME_CLASS, FIXED_FRAME_STYLE } from './cashflowGridStyles';

/**
 * Células compartilhadas da planilha de Fluxo de Caixa. Toda linha da grade
 * (item, edição, nova, grupo, resumo, cabeçalho) monta-se com estas peças —
 * o boilerplate de `position: sticky` das 4 colunas fixas vive só aqui.
 */

export type FixedCol = 0 | 1 | 2 | 3;

// Cabeçalho: bordas inline (o <th> sticky precisa delas explícitas p/ cobrir a emenda).
const HEAD_LINE = '1px solid rgb(229 231 235)';
const HEADER_FRAME_STYLE: React.CSSProperties[] = [
  { borderTop: HEAD_LINE, borderBottom: HEAD_LINE, borderLeft: HEAD_LINE, borderRight: 'none' },
  { borderTop: HEAD_LINE, borderBottom: HEAD_LINE, borderLeft: 'none', borderRight: 'none' },
  { borderTop: HEAD_LINE, borderBottom: HEAD_LINE, borderLeft: 'none', borderRight: 'none' },
  {
    borderTop: HEAD_LINE,
    borderBottom: HEAD_LINE,
    borderLeft: 'none',
    borderRight: '1px solid rgb(203 213 225)',
  },
];

interface FixedCellProps {
  col: FixedCol;
  /**
   * `plain`: sem bordas (linhas de item). `framed`: borda em cima/embaixo,
   * esquerda na col 0 e direita na col 3 (linhas de grupo/resumo/cabeçalho).
   */
  frame?: 'plain' | 'framed';
  isHeader?: boolean;
  /** Fonte/cor/alinhamento. A célula já traz padding, altura e nowrap. */
  className?: string;
  /** Fundo opaco (obrigatório em sticky), z-index e estilos condicionais. Aplicado por último. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const FixedCell: React.FC<FixedCellProps> = ({
  col,
  frame = 'plain',
  isHeader = false,
  className = '',
  style,
  children,
}) => {
  const framed = frame === 'framed';
  const base = isHeader ? FIXED_COLUMN_HEADER_STYLES[col] : FIXED_COLUMN_BODY_STYLES[col];
  const frameStyle = isHeader
    ? HEADER_FRAME_STYLE[col]
    : framed
      ? FIXED_FRAME_STYLE[col]
      : { border: 'none' };
  return (
    <TableCell
      isHeader={isHeader}
      className={`${GRID.fixed} ${GRID.cell} ${framed ? FIXED_FRAME_CLASS[col] : ''} ${className}`}
      style={{
        position: 'sticky',
        ...(isHeader ? { top: 0 } : {}),
        ...base,
        overflow: 'hidden',
        flexShrink: 0,
        ...frameStyle,
        ...style,
      }}
    >
      {children}
    </TableCell>
  );
};

interface MonthCellProps {
  /** Índice do mês (0 = Jan). Só as variantes negrito diferenciam a 1ª coluna. */
  index: number;
  /** `data`: célula de item (fundo cinza). `bold`: grupo/resumo (bordas cinza). */
  variant?: 'data' | 'bold';
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const MonthCell: React.FC<MonthCellProps> = ({
  index,
  variant = 'data',
  className = '',
  style,
  children,
}) => {
  if (variant === 'bold') {
    return (
      <TableCell
        className={`${GRID.boldMonth} ${GRID.cell} align-middle ${
          index === 0 ? GRID.boldMonthFirst : GRID.boldMonthOther
        } ${className}`}
        style={{ ...GRID.monthStyle, ...style }}
      >
        {children}
      </TableCell>
    );
  }
  return (
    <TableCell
      className={`px-1 ${GRID.dataCell} ${GRID.cell} ${className}`}
      style={{ ...GRID.monthStyle, ...style }}
    >
      {children}
    </TableCell>
  );
};

interface AnnualCellProps {
  variant?: 'data' | 'bold';
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const AnnualCell: React.FC<AnnualCellProps> = ({
  variant = 'data',
  className = '',
  style,
  children,
}) => (
  <TableCell
    className={`${
      variant === 'bold' ? `${GRID.boldAnnual} align-middle` : `px-2 ${GRID.dataCell}`
    } ${GRID.cell} ${className}`}
    style={{ ...GRID.annualStyle, ...style }}
  >
    {children}
  </TableCell>
);

/** Coluna vazia de 10px entre Dez e Total Anual. */
export const SpacerCell: React.FC = () => <TableCell className={GRID.spacer} />;

/** Coluna "Ações" (só aparece com algum grupo em edição). */
export const ActionsCell: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <TableCell className={`px-2 border border-gray-200 w-8 text-center ${GRID.cell}`}>
    {children}
  </TableCell>
);
