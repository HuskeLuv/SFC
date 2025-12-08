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
      ? "text-green-600 dark:text-green-400" 
      : "text-red-600 dark:text-red-400";
  };

  return (
    <TableRow className="h-6 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-white dark:bg-gray-900" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell 
        className={`px-2 font-medium text-gray-800 border-l border-black dark:border-black dark:text-white text-xs w-32 text-left h-6 leading-6 whitespace-nowrap ${isLastItem ? 'border-b' : ''}`}
        style={{ 
          position: 'sticky',
          left: 0,
          zIndex: 50,
          backgroundColor: 'white',
          minWidth: '128px',
          maxWidth: '128px',
          width: '128px',
          boxShadow: '1px 0 0 0 rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}
      >
        <span className="cursor-default truncate block">
          {item.name || ''}
        </span>
      </TableCell>
      <TableCell 
        className={`px-2 font-normal text-gray-800 border-black dark:border-black text-xs dark:text-gray-400 w-40 h-6 leading-6 whitespace-nowrap ${isLastItem ? 'border-b' : ''}`}
        style={{ 
          position: 'sticky',
          left: '128px',
          zIndex: 51,
          backgroundColor: 'white',
          boxShadow: '2px 0 0 0 black',
          minWidth: '160px',
          maxWidth: '160px',
          width: '160px',
          overflow: 'hidden'
        }}
      >
        <span className="cursor-default truncate block">
          {item.significado || '-'}
        </span>
      </TableCell>
      <TableCell 
        className={`px-2 font-normal text-gray-800 border-black dark:border-black text-xs dark:text-gray-400 w-16 text-center h-6 leading-6 whitespace-nowrap ${isLastItem ? 'border-b' : ''}`}
        style={{ 
          position: 'sticky',
          left: '288px',
          zIndex: 52,
          backgroundColor: 'white',
          boxShadow: '2px 0 0 0 black',
          minWidth: '64px',
          maxWidth: '64px',
          width: '64px',
          overflow: 'hidden'
        }}
      >
        <span className="cursor-default">
          {item.rank || '-'}
        </span>
      </TableCell>
      <TableCell 
        className={`px-2 font-normal border-r border-black dark:border-black text-xs w-16 text-right h-6 leading-6 whitespace-nowrap ${isLastItem ? 'border-b' : ''} ${getPercentageColorClass()}`}
        style={{ 
          position: 'sticky',
          left: '352px',
          zIndex: 53,
          backgroundColor: 'white',
          boxShadow: '2px 0 0 0 black',
          minWidth: '64px',
          maxWidth: '64px',
          width: '64px',
          overflow: 'hidden'
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
            className={`px-1 font-normal text-gray-800 border border-black dark:border-black text-xs dark:text-gray-400 w-12 text-right cursor-default h-6 leading-6 bg-[#F2F2F2] ${isLastItem ? 'border-b' : ''}`}
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
      <TableCell className={`px-2 font-semibold text-gray-800 border border-black dark:border-black text-xs dark:text-white w-16 text-right h-6 leading-6 bg-[#F2F2F2] ${isLastItem ? 'border-b' : ''}`}>
        {formatCurrency(itemAnnualTotal)}
      </TableCell>
    </TableRow>
  ); 
}; 