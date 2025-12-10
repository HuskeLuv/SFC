import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { NewRowData } from "@/types/cashflow";
import { ActionButtons } from "./ActionButtons";
import { FIXED_COLUMN_BODY_STYLES } from "./fixedColumns";

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
  onCancel 
}) => (
  <TableRow className="h-6 bg-blue-50 dark:bg-blue-800" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
    <TableCell 
      className="px-2 text-left h-6 leading-6 text-xs whitespace-nowrap"
      style={{ 
        position: 'sticky',
        backgroundColor: 'rgb(239 246 255)', // bg-blue-50
        ...FIXED_COLUMN_BODY_STYLES[0],
        overflow: 'hidden',
        flexShrink: 0,
        border: 'none',
        borderLeft: 'none',
        borderRight: 'none'
      }}
    >
      <div className="flex items-center gap-1 h-6">
        <input
          className="flex-1 min-w-0 px-1 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white h-6 leading-6"
          value={newRow.name}
          onChange={e => onUpdateField("name", e.target.value)}
          placeholder="Nome"
          autoFocus
        />
        <div className="flex-shrink-0">
          <ActionButtons onSave={onSave} onCancel={onCancel} />
        </div>
      </div>
    </TableCell>
    <TableCell 
      className="px-2 h-6 leading-6 text-xs whitespace-nowrap"
      style={{ 
        position: 'sticky',
        backgroundColor: 'rgb(239 246 255)', // bg-blue-50
        ...FIXED_COLUMN_BODY_STYLES[1],
        overflow: 'hidden',
        flexShrink: 0,
        border: 'none',
        borderLeft: 'none',
        borderRight: 'none'
      }}
    >
      <input
        className="w-full px-1 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white h-6 leading-6"
        value={newRow.significado || ''}
        onChange={e => onUpdateField("significado", e.target.value)}
        placeholder="Significado"
      />
    </TableCell>
    <TableCell 
      className="px-2 text-center h-6 leading-6 text-xs whitespace-nowrap"
      style={{ 
        position: 'sticky',
        backgroundColor: 'rgb(239 246 255)', // bg-blue-50
        ...FIXED_COLUMN_BODY_STYLES[2],
        overflow: 'hidden',
        flexShrink: 0,
        border: 'none',
        borderLeft: 'none',
        borderRight: 'none'
      }}
    >
      -
    </TableCell>
    <TableCell 
      className="px-2 text-right h-6 leading-6 text-xs whitespace-nowrap"
      style={{ 
        position: 'sticky',
        backgroundColor: 'rgb(239 246 255)', // bg-blue-50
        ...FIXED_COLUMN_BODY_STYLES[3],
        overflow: 'hidden',
        flexShrink: 0,
        border: 'none',
        borderLeft: 'none',
        borderRight: 'none'
      }}
    >
      -
    </TableCell>
    {Array.from({ length: 12 }).map((_, i) => (
      <TableCell key={i} className="px-1 text-right h-6 leading-6 text-xs bg-[#F2F2F2] border-t border-b border-l border-r border-white" style={{ minWidth: '3rem' }}>
        -
      </TableCell>
    ))}
    {/* Coluna vazia para espaçamento */}
    <TableCell className="px-0 w-[10px] h-6 leading-6 text-xs bg-white dark:bg-white"></TableCell>
    <TableCell className="px-2 text-right h-6 leading-6 text-xs bg-[#F2F2F2] border-t border-b border-l border-r border-white" style={{ minWidth: '4rem' }}>
      -
    </TableCell>
  </TableRow>
); 