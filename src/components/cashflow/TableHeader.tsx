import React from 'react';
import { TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { MONTHS } from '@/constants/cashflow';
import { FIXED_COLUMN_HEADER_STYLES } from './fixedColumns';

interface TableHeaderComponentProps {
  showActionsColumn?: boolean;
}

// Estilos comuns para células sticky do cabeçalho
const stickyHeaderCellStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 400,
};

export const TableHeaderComponent: React.FC<TableHeaderComponentProps> = ({
  showActionsColumn = false,
}) => (
  <TableHeader
    className="bg-white dark:bg-gray-900"
    style={{
      position: 'sticky',
      top: 0,
      zIndex: 400,
      isolation: 'isolate',
    }}
  >
    <TableRow
      className="h-6 bg-white dark:bg-gray-900"
      style={{
        fontFamily: 'Calibri, sans-serif',
        fontSize: '12px',
      }}
    >
      {['Itens', 'Significado', 'Rank', '% Receita'].map((label, index) => (
        <TableCell
          key={label}
          isHeader
          className="px-2 border-t border-b border-gray-200 text-center h-6 text-xs leading-6 bg-white dark:bg-gray-900 whitespace-nowrap"
          style={{
            ...stickyHeaderCellStyle,
            ...FIXED_COLUMN_HEADER_STYLES[index],
            overflow: 'hidden',
            flexShrink: 0,
            borderTop: '1px solid rgb(229 231 235)',
            borderBottom: '1px solid rgb(229 231 235)',
            borderLeft: index === 0 ? '1px solid rgb(229 231 235)' : 'none',
            borderRight: index === 3 ? '1px solid rgb(203 213 225)' : 'none',
          }}
        >
          <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
            {label}
          </p>
        </TableCell>
      ))}
      {MONTHS.map((month, index) => (
        <TableCell
          key={month}
          isHeader
          id={index === 0 ? 'first-month-cell' : undefined}
          className={`px-1 border-t border-b border-gray-200 border-r border-gray-200 text-center h-6 text-xs leading-6 bg-white dark:bg-gray-900 whitespace-nowrap ${
            index === 0 ? 'border-l-0' : 'border-l border-gray-200'
          }`}
          style={{
            ...stickyHeaderCellStyle,
            minWidth: '3rem',
          }}
        >
          <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
            {month}
          </p>
        </TableCell>
      ))}
      {/* Coluna vazia para espaçamento */}
      <TableCell
        isHeader
        className="px-0 w-[10px] h-6 text-xs leading-6 bg-white dark:bg-gray-900 border-0 p-0 relative"
        style={{
          border: 'none',
          padding: 0,
          position: 'relative',
          overflow: 'visible',
        }}
      >
        <div
          className="bg-white dark:bg-gray-900"
          style={{
            position: 'absolute',
            top: '-3px',
            left: '1px',
            right: 0,
            bottom: '-3px',
            zIndex: 35,
          }}
        />
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t border-b border-gray-200 border border-gray-200 text-center h-6 text-xs leading-6 bg-white dark:bg-gray-900 whitespace-nowrap"
        style={{
          ...stickyHeaderCellStyle,
          minWidth: '4rem',
        }}
      >
        <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
          Total Anual
        </p>
      </TableCell>
      {showActionsColumn && (
        <TableCell
          isHeader
          className="px-2 border-t border-b border-gray-200 border border-gray-200 text-center h-6 text-xs leading-6 bg-white dark:bg-gray-900 whitespace-nowrap"
          style={{
            ...stickyHeaderCellStyle,
            minWidth: '2rem',
          }}
        >
          <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
            Ações
          </p>
        </TableCell>
      )}
    </TableRow>
  </TableHeader>
);
