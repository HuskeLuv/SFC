import React from 'react';
import { TableRow } from '@/components/ui/table';
import { NewRowData } from '@/types/cashflow';
import { ActionButtons } from './ActionButtons';
import { FixedCell, MonthCell, AnnualCell, SpacerCell } from './GridCells';
import { GRID } from './cashflowGridStyles';

interface AddRowFormProps {
  newRow: NewRowData;
  onUpdateField: (field: keyof NewRowData, value: string | number) => void;
  onSave: () => void;
  onCancel: () => void;
}

const FORM_BG = { backgroundColor: GRID.editingBg };
const INPUT_CLASS =
  'px-1 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white h-6 leading-6';

export const AddRowForm: React.FC<AddRowFormProps> = ({
  newRow,
  onUpdateField,
  onSave,
  onCancel,
}) => (
  <TableRow className={`${GRID.row} bg-blue-50 dark:bg-blue-800`} style={GRID.rowStyle}>
    <FixedCell col={0} className="text-left" style={FORM_BG}>
      <div className="flex items-center gap-1 h-6">
        <input
          size={1}
          className={`flex-1 min-w-0 ${INPUT_CLASS}`}
          value={newRow.name}
          onChange={(e) => onUpdateField('name', e.target.value)}
          placeholder="Nome"
          autoFocus
        />
        <div className="flex-shrink-0">
          <ActionButtons onSave={onSave} onCancel={onCancel} />
        </div>
      </div>
    </FixedCell>
    <FixedCell col={1} style={FORM_BG}>
      <input
        size={1}
        className={`w-full ${INPUT_CLASS}`}
        value={newRow.significado || ''}
        onChange={(e) => onUpdateField('significado', e.target.value)}
        placeholder="O seu porquê"
      />
    </FixedCell>
    <FixedCell col={2} className="text-center" style={FORM_BG}>
      -
    </FixedCell>
    <FixedCell col={3} className="text-right" style={FORM_BG}>
      -
    </FixedCell>
    {Array.from({ length: 12 }).map((_, i) => (
      <MonthCell key={i} index={i} className="text-right">
        -
      </MonthCell>
    ))}
    <SpacerCell />
    <AnnualCell className="text-right">-</AnnualCell>
  </TableRow>
);
