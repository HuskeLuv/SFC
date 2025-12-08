import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { NewRowData } from "@/types/cashflow";
import { ActionButtons } from "./ActionButtons";

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
    <TableCell className="px-2 border-t border-b border-l border-black dark:border-black w-32 text-left h-6 leading-6 text-xs">
      <div className="flex items-center gap-2 h-6">
        <input
          className="w-full px-1 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white h-6 leading-6"
          value={newRow.name}
          onChange={e => onUpdateField("name", e.target.value)}
          placeholder="Nome"
          autoFocus
        />
        <ActionButtons onSave={onSave} onCancel={onCancel} />
      </div>
    </TableCell>
    <TableCell className="px-2 border-t border-b border-black dark:border-black w-40 h-6 leading-6 text-xs">
      <input
        className="w-full px-1 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white h-6 leading-6"
        value={newRow.significado || ''}
        onChange={e => onUpdateField("significado", e.target.value)}
        placeholder="Significado"
      />
    </TableCell>
    <TableCell className="px-2 border-t border-b border-black dark:border-black w-16 text-center h-6 leading-6 text-xs">
      -
    </TableCell>
    <TableCell className="px-2 border-t border-b border-r border-black dark:border-black w-16 text-right h-6 leading-6 text-xs">
      -
    </TableCell>
    {Array.from({ length: 12 }).map((_, i) => (
      <TableCell key={i} className="px-1 border border-black dark:border-black w-12 text-right h-6 leading-6 text-xs bg-[#F2F2F2]">
        -
      </TableCell>
    ))}
    {/* Coluna vazia para espaçamento */}
    <TableCell className="px-0 w-[10px] h-6 leading-6 text-xs bg-white dark:bg-white"></TableCell>
    <TableCell className="px-2 border border-black dark:border-black w-16 text-right h-6 leading-6 text-xs bg-[#F2F2F2]">
      -
    </TableCell>
  </TableRow>
); 