import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { formatCurrency, isReceitaGroupByType } from "@/utils/formatters";
import { FIXED_COLUMN_BODY_STYLES } from "./fixedColumns";

interface NewItemRowProps {
  item: CashflowItem;
  group: CashflowGroup;
  onItemUpdate?: (updatedItem: CashflowItem) => void;
  startEditing: (itemId: string, field: string, monthIndex?: number) => void;
  stopEditing: () => void;
  isEditing: (itemId: string, field: string, monthIndex?: number) => boolean;
  isLastItem?: boolean;
}

export const NewItemRow: React.FC<NewItemRowProps> = ({ 
  item, 
  group,
  isLastItem = false,
}) => {
  const isReceita = isReceitaGroupByType(group.type);

  const getPercentageColorClass = () => {
    return "text-black dark:text-black";
  };

  return (
    <TableRow className="h-6 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-blue-50 dark:bg-blue-800" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell 
        className="px-2 font-medium text-gray-800 dark:text-white text-xs text-left h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          backgroundColor: 'rgb(239 246 255)',
          ...FIXED_COLUMN_BODY_STYLES[0],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        <span className="cursor-default truncate block">
          {item.name || ''}
        </span>
      </TableCell>
      <TableCell 
        className="px-2 font-normal text-gray-800 text-xs dark:text-gray-400 h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          backgroundColor: 'rgb(239 246 255)',
          ...FIXED_COLUMN_BODY_STYLES[1],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        <span className="cursor-default truncate block">
          {item.significado || '-'}
        </span>
      </TableCell>
      <TableCell 
        className="px-2 font-normal text-gray-800 text-xs dark:text-gray-400 text-center h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          backgroundColor: 'rgb(239 246 255)',
          ...FIXED_COLUMN_BODY_STYLES[2],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        <span className="cursor-default">
          {item.rank || '-'}
        </span>
      </TableCell>
      <TableCell 
        className={`px-2 font-normal text-xs text-right h-6 leading-6 whitespace-nowrap ${getPercentageColorClass()}`}
        style={{ 
          position: 'sticky',
          backgroundColor: 'rgb(239 246 255)',
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
      {Array.from({ length: 12 }).map((_, index) => (
        <TableCell key={index} className="px-1 font-normal text-gray-800 text-xs dark:text-gray-400 text-right cursor-default h-6 leading-6 bg-[#F2F2F2] border-t border-b border-l border-r border-white" style={{ minWidth: '3rem' }}>
          {formatCurrency(0)}
        </TableCell>
      ))}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white">
      </TableCell>
      <TableCell className="px-2 font-semibold text-gray-800 text-xs dark:text-white text-right h-6 leading-6 bg-[#F2F2F2] border-t border-b border-l border-r border-white" style={{ minWidth: '4rem' }}>
        {formatCurrency(0)}
      </TableCell>
    </TableRow>
  );
}; 