import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { formatCurrency, formatPercent, isReceitaGroupByType } from "@/utils/formatters";
import { EditableCell } from "./EditableCell";
import { EditableDescriptionCell } from "./EditableDescriptionCell";
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
  globalEditMode?: boolean;
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
  isEditing,
  globalEditMode = false
}) => {
  const isReceita = isReceitaGroupByType(group.type);

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

  const handleSaveDescription = async (descricao: string, significado: string) => {
    try {
      // Update both descricao and significado
      await updateCashflowValue(item.id, 'descricao', descricao);
      await updateCashflowValue(item.id, 'significado', significado);
      
      // Refresh the data
      onItemUpdate?.({ ...item, descricao, significado });
      stopEditing();
    } catch (error) {
      console.error('Erro ao atualizar descrição:', error);
    }
  };

  const handleCancel = () => {
    stopEditing();
  };

  const handleStartEdit = (field: string, monthIndex?: number) => {
    startEditing(item.id, field, monthIndex);
  };

  const getPercentageColorClass = () => {
    return isReceita 
      ? "text-green-600 dark:text-green-400" 
      : "text-red-600 dark:text-red-400";
  };

  return (
  <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
      <EditableDescriptionCell
        descricao={item.descricao || ''}
        significado={item.significado}
        onSave={handleSaveDescription}
        onCancel={handleCancel}
        isEditing={isEditing(item.id, 'descricao')}
        onStartEdit={() => handleStartEdit('descricao')}
        className="px-2 py-2 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-xs w-32"
        globalEditMode={globalEditMode}
      />
      <TableCell className={`px-2 py-2 font-normal border border-gray-100 dark:border-white/[0.05] text-xs w-16 text-right ${getPercentageColorClass()}`}>
        {itemPercentage > 0 ? formatPercent(itemPercentage) : '-'}
      </TableCell>
      {itemTotals.map((value, index) => (
        <EditableCell
          key={index}
          value={value || 0}
          onSave={(value) => handleSave('monthlyValue', value, index)}
          onCancel={handleCancel}
          isEditing={isEditing(item.id, 'monthlyValue', index)}
          onStartEdit={() => handleStartEdit('monthlyValue', index)}
          type="currency"
          className="px-1 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-12 text-right"
          placeholder="0.00"
          globalEditMode={globalEditMode}
        />
    ))}
    <TableCell className="px-2 py-2 font-semibold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
      {formatCurrency(itemAnnualTotal)}
    </TableCell>
  </TableRow>
); 
}; 