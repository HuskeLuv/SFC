import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { formatCurrency, formatPercent, isReceitaGroupByType } from "@/utils/formatters";
import NewEditableCell from "./NewEditableCell";
import { updateCashflowValue } from "@/utils/cashflowUpdate";

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
  onItemUpdate,
  startEditing,
  stopEditing,
  isEditing
}) => {
  const isReceita = isReceitaGroupByType(group.type);
  
  // Não permitir edição de itens de investimento (calculados automaticamente)
  const isInvestmentItem = item.isInvestment || item.id.startsWith('investimento-');

  const handleSave = async (field: string, value: string | number, monthIndex?: number) => {
    try {
      const updatedItem = await updateCashflowValue(item.id, field, value, monthIndex);
      onItemUpdate?.(updatedItem);
      stopEditing();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      // You might want to show an alert here
    }
  };

  const handleCancel = () => {
    stopEditing();
  };

  const handleStartEdit = (field: string, monthIndex?: number) => {
    // Não permitir edição de itens de investimento
    if (isInvestmentItem) return;
    startEditing(item.id, field, monthIndex);
  };

  const getPercentageColorClass = () => {
    return isReceita 
      ? "text-green-600 dark:text-green-400" 
      : "text-red-600 dark:text-red-400";
  };

  return (
  <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
      <TableCell className="px-2 py-2 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-xs w-32">
        {item.significado ? (
          <div 
            title={item.significado}
            className="cursor-help hover:text-gray-600 dark:hover:text-gray-300"
          >
            {item.descricao || ''}
          </div>
        ) : (
          <span className={isInvestmentItem ? 'cursor-default' : 'cursor-pointer'} onClick={() => !isInvestmentItem && handleStartEdit('descricao')}>
            {item.descricao || ''}
          </span>
        )}
      </TableCell>
      <TableCell className={`px-2 py-2 font-normal border border-gray-100 dark:border-white/[0.05] text-xs w-16 text-right ${getPercentageColorClass()}`}>
        {itemPercentage > 0 ? formatPercent(itemPercentage) : '-'}
      </TableCell>
      {itemTotals.map((value, index) => (
        <TableCell key={index} className={`px-1 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-12 text-right ${isInvestmentItem ? 'cursor-default' : ''}`}>
          <NewEditableCell
            value={value || 0}
            isEditing={isEditing(item.id, 'monthlyValue', index)}
            onStartEdit={() => handleStartEdit('monthlyValue', index)}
            onStopEdit={handleCancel}
            onValueChange={(newValue) => handleSave('monthlyValue', newValue, index)}
            type="currency"
            placeholder="0.00"
          />
        </TableCell>
      ))}
    <TableCell className="px-2 py-2 font-semibold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
      {formatCurrency(itemAnnualTotal)}
    </TableCell>
  </TableRow>
); 
}; 