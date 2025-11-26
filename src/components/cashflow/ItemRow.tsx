import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { formatCurrency, formatPercent, isReceitaGroupByType } from "@/utils/formatters";

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
}

export const ItemRow: React.FC<ItemRowProps> = ({ 
  item, 
  itemTotals, 
  itemAnnualTotal,
  itemPercentage,
  group,
}) => {
  const isReceita = isReceitaGroupByType(group.type);
  
  // Não permitir edição de itens de investimento (calculados automaticamente)
  const isInvestmentItem = group.type === 'investimento' || item.id.startsWith('investimento-');

  const getPercentageColorClass = () => {
    return isReceita 
      ? "text-green-600 dark:text-green-400" 
      : "text-red-600 dark:text-red-400";
  };

  return (
    <TableRow className="h-6 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell className="px-2 font-medium text-gray-800 border-t border-b border-l border-black dark:border-black dark:text-white text-xs w-32 text-left h-6 leading-6">
        <span className="cursor-default">
          {item.name || ''}
        </span>
      </TableCell>
      <TableCell className="px-2 font-normal text-gray-800 border-t border-b border-black dark:border-black text-xs dark:text-gray-400 w-40 h-6 leading-6">
        <span className="cursor-default">
          {item.significado || '-'}
        </span>
      </TableCell>
      <TableCell className="px-2 font-normal text-gray-800 border-t border-b border-black dark:border-black text-xs dark:text-gray-400 w-16 text-center h-6 leading-6">
        <span className="cursor-default">
          {item.rank || '-'}
        </span>
      </TableCell>
      <TableCell className={`px-2 font-normal border-t border-b border-r border-black dark:border-black text-xs w-16 text-right h-6 leading-6 ${getPercentageColorClass()}`}>
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
            className="px-1 font-normal text-gray-800 border border-black dark:border-black text-xs dark:text-gray-400 w-12 text-right cursor-default h-6 leading-6 bg-[#F2F2F2]"
          >
            <span style={cellColor ? { color: cellColor } : undefined}>
              {formatCurrency(value || 0)}
            </span>
          </TableCell>
        );
      })}
      <TableCell className="px-2 font-semibold text-gray-800 border border-black dark:border-black text-xs dark:text-white w-16 text-right h-6 leading-6 bg-[#F2F2F2]">
        {formatCurrency(itemAnnualTotal)}
      </TableCell>
    </TableRow>
  ); 
}; 