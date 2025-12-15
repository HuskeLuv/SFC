import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { formatCurrency, formatPercent, isReceitaGroupByType } from "@/utils/formatters";
import { FIXED_COLUMN_BODY_STYLES } from "./fixedColumns";

interface ItemRowProps {
  item: CashflowItem;
  itemTotals: number[];
  itemAnnualTotal: number;
  itemPercentage: number;
  group: CashflowGroup;
  onItemUpdate?: (updatedItem: CashflowItem) => void;
  startEditing: (itemId: string, field: string, monthIndex?: number) => void;
  stopEditing: () => void;
  isEditing: (itemId: string, field: string, monthIndex?: number) => boolean;
  isLastItem?: boolean;
}

export const ItemRow: React.FC<ItemRowProps> = ({ 
  item, 
  itemTotals, 
  itemAnnualTotal,
  itemPercentage,
  group,
  isLastItem = false,
}) => {
  const isReceita = isReceitaGroupByType(group.type);
  
  // Não permitir edição de itens de investimento (calculados automaticamente)
  const isInvestmentItem = group.type === 'investimento' || item.id.startsWith('investimento-');

  const getPercentageColorClass = () => {
    return isReceita 
      ? "text-black dark:text-black" 
      : "text-red-600 dark:text-red-400";
  };

  return (
    <TableRow className="h-6 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-white dark:bg-gray-900" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell 
        className="px-2 font-medium text-gray-800 dark:text-white text-xs text-left h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          backgroundColor: 'white',
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
          backgroundColor: 'white',
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
          backgroundColor: 'white',
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
          backgroundColor: 'white',
          ...FIXED_COLUMN_BODY_STYLES[3],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        {group.name === 'Investimentos' ? '-' : (itemPercentage > 0 ? formatPercent(itemPercentage) : '-')}
      </TableCell>
      {itemTotals.map((value, index) => {
        // Obter cor do valor mensal se existir
        // Buscar em item.values que pode vir do banco
        // IMPORTANTE: Buscar por month (0-11) que corresponde ao índice
        const monthlyValue = item.values?.find((v) => v.month === index);
        const cellColor = monthlyValue?.color || null;
        
        return (
          <TableCell
            key={index}
            className="px-1 font-normal text-gray-800 text-xs dark:text-gray-400 text-right cursor-default h-6 leading-6 bg-[#F2F2F2] border-t border-b border-l border-r border-white"
          >
            <span style={cellColor ? { color: cellColor } : undefined}>
              {formatCurrency(value || 0)}
            </span>
          </TableCell>
        );
      })}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white">
      </TableCell>
      <TableCell className="px-2 font-semibold text-gray-800 text-xs dark:text-white text-right h-6 leading-6 bg-[#F2F2F2] border-t border-b border-l border-r border-white" style={{ minWidth: '4rem' }}>
        {formatCurrency(itemAnnualTotal)}
      </TableCell>
    </TableRow>
  ); 
}; 