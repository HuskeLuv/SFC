import React from 'react';
import { StandardTableRow, StandardTableBodyCell } from '@/components/ui/table/StandardTable';
import { TableRow, TableCell } from '@/components/ui/table';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { twMerge } from 'tailwind-merge';

type PlaceholderRowsProps = {
  count: number;
  colSpan: number;
  rowClassName?: string;
  cellClassName?: string;
  /**
   * Padding da célula. As tabelas de carteira (muitas colunas) usam a variante
   * `compact` — por isso é o padrão. Passe `false` em tabelas auxiliares
   * estreitas que usam `TABLE_STYLES.td` normal, para manter o alinhamento.
   */
  compact?: boolean;
};

const PLACEHOLDER_CELL = 'italic text-gray-400';

const placeholderCellClass = (compact: boolean, extra = '') =>
  twMerge(compact ? TABLE_STYLES.compact.td : TABLE_STYLES.td, PLACEHOLDER_CELL, extra);

const PlaceholderContent: React.FC = () => {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2 w-24 rounded bg-gray-200 dark:bg-gray-700/60" />
      <span className="text-gray-400">—</span>
    </div>
  );
};

export const StandardTablePlaceholderRows: React.FC<PlaceholderRowsProps> = ({
  count,
  colSpan,
  rowClassName = '',
  cellClassName = '',
  compact = true,
}) => {
  if (count <= 0) return null;

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <StandardTableRow
          key={`placeholder-${index}`}
          className={`${TABLE_STYLES.placeholderRow} ${rowClassName}`}
        >
          {/* StandardTableBodyCell faz twMerge — a variante compact sobrescreve o padding. */}
          <StandardTableBodyCell
            colSpan={colSpan}
            align="left"
            className={placeholderCellClass(compact, cellClassName)}
          >
            <PlaceholderContent />
          </StandardTableBodyCell>
        </StandardTableRow>
      ))}
    </>
  );
};

export const BasicTablePlaceholderRows: React.FC<PlaceholderRowsProps> = ({
  count,
  colSpan,
  rowClassName = '',
  cellClassName = '',
  compact = true,
}) => {
  if (count <= 0) return null;

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <tr
          key={`placeholder-${index}`}
          className={`${TABLE_STYLES.placeholderRow} ${rowClassName}`}
        >
          <td colSpan={colSpan} className={placeholderCellClass(compact, cellClassName)}>
            <PlaceholderContent />
          </td>
        </tr>
      ))}
    </>
  );
};

export const UiTablePlaceholderRows: React.FC<PlaceholderRowsProps> = ({
  count,
  colSpan,
  rowClassName = '',
  cellClassName = '',
  compact = true,
}) => {
  if (count <= 0) return null;

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <TableRow
          key={`placeholder-${index}`}
          className={`${TABLE_STYLES.placeholderRow} ${rowClassName}`}
        >
          <TableCell colSpan={colSpan} className={placeholderCellClass(compact, cellClassName)}>
            <PlaceholderContent />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
};
