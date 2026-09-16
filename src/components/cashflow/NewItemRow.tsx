import React from 'react';
import { TableRow } from '@/components/ui/table';
import { CashflowItem } from '@/types/cashflow';
import { formatCurrency } from '@/utils/formatters';
import { FixedCell, MonthCell, AnnualCell, SpacerCell } from './GridCells';
import { GRID } from './cashflowGridStyles';

interface NewItemRowProps {
  /** Linha recém-criada (ainda sem valores) — aparece até o refetch da árvore. */
  item: CashflowItem;
}

const NEW_BG = { backgroundColor: GRID.editingBg };

export const NewItemRow: React.FC<NewItemRowProps> = ({ item }) => (
  <TableRow
    className={`${GRID.row} hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-blue-50 dark:bg-blue-800`}
    style={GRID.rowStyle}
  >
    <FixedCell
      col={0}
      className="font-medium text-gray-800 dark:text-white text-left"
      style={NEW_BG}
    >
      <span className="cursor-default truncate block">{item.name || ''}</span>
    </FixedCell>
    <FixedCell col={1} className="font-normal text-gray-800 dark:text-gray-400" style={NEW_BG}>
      <span className="cursor-default truncate block">{item.significado || '-'}</span>
    </FixedCell>
    <FixedCell
      col={2}
      className="font-normal text-gray-800 dark:text-gray-400 text-center"
      style={NEW_BG}
    >
      <span className="cursor-default">{item.rank || '-'}</span>
    </FixedCell>
    <FixedCell col={3} className="font-normal text-black dark:text-black text-right" style={NEW_BG}>
      -
    </FixedCell>
    {Array.from({ length: 12 }).map((_, index) => (
      <MonthCell key={index} index={index} className={`${GRID.dataText} cursor-default`}>
        {formatCurrency(0)}
      </MonthCell>
    ))}
    <SpacerCell />
    <AnnualCell className={GRID.annualText}>{formatCurrency(0)}</AnnualCell>
  </TableRow>
);
