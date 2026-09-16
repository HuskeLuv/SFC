import React from 'react';
import { TableRow } from '@/components/ui/table';
import { NewRowData } from '@/types/cashflow';
import { ActionButtons } from './ActionButtons';
import { FixedCell, MonthCell, AnnualCell } from './GridCells';
import { GRID } from './cashflowGridStyles';

interface AddRowFormProps {
  newRow: NewRowData;
  onUpdateField: (field: keyof NewRowData, value: string | number) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const AddRowForm: React.FC<AddRowFormProps> = ({
  newRow,
  onUpdateField,
  onSave,
  onCancel,
}) => (
  <TableRow className={`${GRID.row} ${GRID.editingBg}`}>
    <FixedCell col={0} className={GRID.editingBg}>
      <div className="flex items-center gap-1 h-7">
        <input
          size={1}
          className={`flex-1 min-w-0 ${GRID.input}`}
          value={newRow.name}
          onChange={(e) => onUpdateField('name', e.target.value)}
          placeholder="Nome"
          aria-label="Nome da nova linha"
          autoFocus
        />
        <div className="flex-shrink-0">
          <ActionButtons onSave={onSave} onCancel={onCancel} />
        </div>
      </div>
    </FixedCell>
    <FixedCell col={1} className={GRID.editingBg}>
      <input
        size={1}
        className={GRID.input}
        value={newRow.significado || ''}
        onChange={(e) => onUpdateField('significado', e.target.value)}
        placeholder="O seu porquê"
        aria-label="O seu porquê da nova linha"
      />
    </FixedCell>
    <FixedCell col={2} className={`text-center ${GRID.editingBg}`} />
    <FixedCell col={3} className={`text-right ${GRID.editingBg}`} />
    {Array.from({ length: 12 }).map((_, i) => (
      <MonthCell key={i} index={i} className="text-gray-400" />
    ))}
    <AnnualCell className={GRID.editingBg} />
  </TableRow>
);
