import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { formatCurrency, isReceitaGroupByType } from "@/utils/formatters";

interface NewItemRowProps {
  item: CashflowItem;
  group: CashflowGroup;
  onItemUpdate?: (updatedItem: CashflowItem) => void;
  startEditing: (itemId: string, field: string, monthIndex?: number) => void;
  stopEditing: () => void;
  isEditing: (itemId: string, field: string, monthIndex?: number) => boolean;
}

export const NewItemRow: React.FC<NewItemRowProps> = ({ 
  item, 
  group,
}) => {
  const isReceita = isReceitaGroupByType(group.type);

  const getPercentageColorClass = () => {
    return isReceita 
      ? "text-green-600 dark:text-green-400" 
      : "text-red-600 dark:text-red-400";
  };

  return (
    <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-blue-50 dark:bg-blue-800">
      <TableCell className="px-2 py-2 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-xs w-32">
        <span className="cursor-default">
          {item.name || ''}
        </span>
      </TableCell>
      <TableCell className="px-2 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-40">
        <span className="cursor-default">
          {item.significado || '-'}
        </span>
      </TableCell>
      <TableCell className="px-2 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-16 text-center">
        <span className="cursor-default">
          {item.rank || '-'}
        </span>
      </TableCell>
      <TableCell className={`px-2 py-2 font-normal border border-gray-100 dark:border-white/[0.05] text-xs w-16 text-right ${getPercentageColorClass()}`}>
        -
      </TableCell>
      {Array.from({ length: 12 }).map((_, index) => (
        <TableCell key={index} className="px-1 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-12 text-right cursor-default">
          {formatCurrency(0)}
        </TableCell>
      ))}
      <TableCell className="px-2 py-2 font-semibold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
        {formatCurrency(0)}
      </TableCell>
    </TableRow>
  );
}; 