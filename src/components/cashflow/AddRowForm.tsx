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
  <TableRow className="bg-blue-50 dark:bg-blue-800">
    <TableCell className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-32">
      <div className="flex items-center gap-2">
      <input
          className="w-full px-1 py-0.5 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        value={newRow.name}
        onChange={e => onUpdateField("name", e.target.value)}
        placeholder="Nome"
        autoFocus
      />
        <ActionButtons onSave={onSave} onCancel={onCancel} />
      </div>
    </TableCell>
    <TableCell className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-16 text-right">
      -
    </TableCell>
    {Array.from({ length: 12 }).map((_, i) => (
      <TableCell key={i} className="px-1 py-2 border border-gray-100 dark:border-white/[0.05] w-12 text-right">
        -
      </TableCell>
    ))}
    <TableCell className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-16 text-right">
      -
    </TableCell>
  </TableRow>
); 