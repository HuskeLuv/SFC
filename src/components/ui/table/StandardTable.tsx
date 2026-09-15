import React from 'react';
import { twMerge } from 'tailwind-merge';
import { Table, TableHeader, TableBody, TableRow, TableCell } from './index';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from './tableStyles';

/**
 * Componentes de tabela padronizados — realinhados ao padrão visual único
 * do sistema (`tableStyles.ts`, referência: tabela do Orçamento).
 *
 * PADRÃO VISUAL:
 * - Wrapper: `TABLE_STYLES.wrapper` (cantos arredondados, borda fina, scroll X)
 * - Header: fundo azul `TABLE_HEADER_STYLE` por padrão (`headerBgColor` pode
 *   sobrescrever), texto branco em caixa alta, `TABLE_STYLES.th`
 * - Linhas: `TABLE_STYLES.row` (só borda horizontal sutil, sem bordas verticais);
 *   `isTotal` → `TABLE_STYLES.totalRow`; `onClick` adiciona `rowHover`
 * - Células: `TABLE_STYLES.td` (text-sm); `isTotal` → fonte semibold
 */

const alignClassOf = (align: 'left' | 'center' | 'right') =>
  ({ left: 'text-left', center: 'text-center', right: 'text-right' })[align];

interface StandardTableHeaderCellProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  colSpan?: number;
  headerBgColor?: string;
}

export const StandardTableHeaderCell: React.FC<StandardTableHeaderCellProps> = ({
  children,
  align = 'left',
  className = '',
  colSpan,
  headerBgColor,
}) => {
  return (
    <TableCell
      isHeader
      colSpan={colSpan}
      className={twMerge(TABLE_STYLES.th, alignClassOf(align), className)}
      style={headerBgColor ? { backgroundColor: headerBgColor } : TABLE_HEADER_STYLE}
    >
      {children}
    </TableCell>
  );
};

interface StandardTableBodyCellProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  colSpan?: number;
  isTotal?: boolean;
}

export const StandardTableBodyCell: React.FC<StandardTableBodyCellProps> = ({
  children,
  align = 'left',
  className = '',
  colSpan,
  isTotal = false,
}) => {
  const totalClass = isTotal ? 'font-semibold text-gray-900 dark:text-white' : '';

  return (
    <TableCell
      colSpan={colSpan}
      className={twMerge(TABLE_STYLES.td, totalClass, alignClassOf(align), className)}
    >
      {children}
    </TableCell>
  );
};

interface StandardTableHeaderProps {
  children: React.ReactNode;
  sticky?: boolean;
  headerBgColor?: string;
}

export const StandardTableHeader: React.FC<StandardTableHeaderProps> = ({
  children,
  sticky = false,
  headerBgColor,
}) => {
  const bgStyle = headerBgColor ? { backgroundColor: headerBgColor } : TABLE_HEADER_STYLE;

  return (
    <TableHeader
      style={
        sticky
          ? { position: 'sticky', top: 0, zIndex: 400, isolation: 'isolate', ...bgStyle }
          : bgStyle
      }
    >
      {children}
    </TableHeader>
  );
};

interface StandardTableHeaderRowProps {
  children: React.ReactNode;
  className?: string;
  headerBgColor?: string;
}

export const StandardTableHeaderRow: React.FC<StandardTableHeaderRowProps> = ({
  children,
  className = '',
  headerBgColor,
}) => {
  return (
    <TableRow
      className={`${TABLE_STYLES.headRow} ${className}`}
      style={headerBgColor ? { backgroundColor: headerBgColor } : TABLE_HEADER_STYLE}
    >
      {children}
    </TableRow>
  );
};

interface StandardTableRowProps {
  children: React.ReactNode;
  className?: string;
  isTotal?: boolean;
  onClick?: () => void;
}

export const StandardTableRow: React.FC<StandardTableRowProps> = ({
  children,
  className = '',
  isTotal = false,
  onClick,
}) => {
  const rowClass = isTotal ? TABLE_STYLES.totalRow : TABLE_STYLES.row;
  const hoverClass = onClick ? `${TABLE_STYLES.rowHover} cursor-pointer` : '';

  return (
    <TableRow className={`${rowClass} ${hoverClass} ${className}`} onClick={onClick}>
      {children}
    </TableRow>
  );
};

interface StandardTableProps {
  children: React.ReactNode;
  className?: string;
}

export const StandardTable: React.FC<StandardTableProps> = ({ children, className = '' }) => {
  return (
    <div className={TABLE_STYLES.wrapper}>
      <Table className={`${TABLE_STYLES.table} ${className}`}>{children}</Table>
    </div>
  );
};

export { TableBody, TableRow };
