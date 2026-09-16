import React from 'react';
import { TableCell } from '@/components/ui/table';
import {
  FIXED_COLUMN_BODY_STYLES,
  FIXED_COLUMN_HEADER_STYLES,
  ANNUAL_COLUMN_BODY_STYLE,
  ANNUAL_COLUMN_HEADER_STYLE,
} from './fixedColumns';
import { GRID } from './cashflowGridStyles';

/**
 * Células compartilhadas da planilha de Fluxo de Caixa. Toda linha da grade
 * (item, edição, nova, grupo, resumo, cabeçalho) monta-se com estas peças —
 * o boilerplate de `position: sticky` das colunas fixas vive só aqui.
 *
 * Fundo: célula sticky precisa de fundo OPACO (senão o conteúdo rolado aparece
 * por baixo). Passe-o em `className` (ex.: `GRID.rowBg`, `SECTION_CLASS[1]`).
 */

export type FixedCol = 0 | 1 | 2 | 3;

interface FixedCellProps {
  col: FixedCol;
  isHeader?: boolean;
  /** Fonte/cor/alinhamento + fundo opaco. A célula já traz padding, altura e nowrap. */
  className?: string;
  /** z-index e estilos condicionais (aplicado por último). */
  style?: React.CSSProperties;
  title?: string;
  /** Une colunas fixas (ex.: barra de edição ocupando cols 1-3). Passe a largura somada em `style`. */
  colSpan?: number;
  children?: React.ReactNode;
}

export const FixedCell: React.FC<FixedCellProps> = ({
  col,
  isHeader = false,
  className = '',
  style,
  title,
  colSpan,
  children,
}) => {
  const base = isHeader ? FIXED_COLUMN_HEADER_STYLES[col] : FIXED_COLUMN_BODY_STYLES[col];
  return (
    <TableCell
      isHeader={isHeader}
      className={`${GRID.fixed} ${GRID.cell} ${col === 3 ? GRID.fixedDivider : ''} ${className}`}
      style={{
        position: 'sticky',
        ...(isHeader ? { top: 0 } : {}),
        ...base,
        overflow: 'hidden',
        ...style,
      }}
      title={title}
      colSpan={colSpan}
    >
      {children}
    </TableCell>
  );
};

interface MonthCellProps {
  /** Índice do mês (0 = Jan). */
  index: number;
  /** Índice do mês atual (−1 = planilha de outro ano); pinta a coluna. */
  currentMonth?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const MonthCell: React.FC<MonthCellProps> = ({
  index,
  currentMonth = -1,
  className = '',
  style,
  children,
}) => (
  <TableCell
    className={`${GRID.month} ${GRID.cell} ${index === currentMonth ? GRID.currentMonth : ''} ${className}`}
    style={style}
  >
    {children}
  </TableCell>
);

interface AnnualCellProps {
  isHeader?: boolean;
  /** Fundo opaco obrigatório (sticky à direita). */
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** Total Anual — fixo à direita, sempre visível. */
export const AnnualCell: React.FC<AnnualCellProps> = ({
  isHeader = false,
  className = '',
  style,
  children,
}) => (
  <TableCell
    isHeader={isHeader}
    className={`${GRID.annual} ${GRID.cell} ${className}`}
    style={{
      position: 'sticky',
      ...(isHeader ? { top: 0 } : {}),
      ...(isHeader ? ANNUAL_COLUMN_HEADER_STYLE : ANNUAL_COLUMN_BODY_STYLE),
      ...style,
    }}
  >
    {children}
  </TableCell>
);

/** Respiro entre blocos (antes de seções de nível 1 e 2 e das linhas de resumo). */
export const SpacingRow: React.FC = () => (
  <tr aria-hidden="true">
    <td colSpan={100} className="h-2 border-0 p-0" />
  </tr>
);
