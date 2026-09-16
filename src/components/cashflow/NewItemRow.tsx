import React from 'react';
import { TableRow } from '@/components/ui/table';
import { CashflowItem } from '@/types/cashflow';
import { formatCurrency } from '@/utils/formatters';
import { FixedCell, MonthCell, AnnualCell } from './GridCells';
import { GRID } from './cashflowGridStyles';

interface NewItemRowProps {
  /** Linha recém-criada (ainda sem valores) — aparece até o refetch da árvore. */
  item: CashflowItem;
}

export const NewItemRow: React.FC<NewItemRowProps> = ({ item }) => (
  <TableRow className={`${GRID.row} ${GRID.editingBg}`}>
    <FixedCell
      col={0}
      className={`font-medium text-gray-800 dark:text-gray-100 ${GRID.editingBg}`}
      title={item.name || undefined}
    >
      <span className="cursor-default truncate block">{item.name || ''}</span>
    </FixedCell>
    <FixedCell col={1} className={`text-gray-500 dark:text-gray-400 ${GRID.editingBg}`}>
      <span className="cursor-default truncate block">{item.significado || ''}</span>
    </FixedCell>
    <FixedCell col={2} className={`text-center text-gray-500 dark:text-gray-400 ${GRID.editingBg}`}>
      {item.rank || ''}
    </FixedCell>
    <FixedCell col={3} className={`text-right ${GRID.editingBg}`} />
    {Array.from({ length: 12 }).map((_, index) => (
      <MonthCell key={index} index={index} className="cursor-default">
        {formatCurrency(0)}
      </MonthCell>
    ))}
    <AnnualCell className={GRID.editingBg}>{formatCurrency(0)}</AnnualCell>
  </TableRow>
);
