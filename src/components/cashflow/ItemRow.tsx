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
    <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
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
            className="px-1 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-12 text-right cursor-default"
          >
            <span style={cellColor ? { color: cellColor } : undefined}>
              {formatCurrency(value || 0)}
            </span>
          </TableCell>
        );
      })}
      <TableCell className="px-2 py-2 font-semibold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
        {formatCurrency(itemAnnualTotal)}
      </TableCell>
    </TableRow>
  ); 
}; 