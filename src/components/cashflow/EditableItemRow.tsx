import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { formatCurrency, formatPercent, isReceitaGroupByType } from "@/utils/formatters";
import { CurrencyInput } from "./CurrencyInput";
import { DeleteItemButton } from "./DeleteItemButton";
import { EditableItemData } from "@/hooks/useGroupEditMode";

interface EditableItemRowProps {
  item: CashflowItem;
  editedData: EditableItemData | null;
  group: CashflowGroup;
  itemTotals: number[];
  itemAnnualTotal: number;
  itemPercentage: number;
  isEditing: boolean;
  onUpdateField: (itemId: string, field: "name" | "significado" | "rank" | "monthlyValue", value: string | number | null, monthIndex?: number) => void;
  onDeleteItem: (itemId: string) => void;
  onApplyColor?: (itemId: string, monthIndex: number) => void;
  isColorModeActive?: boolean;
}

export const EditableItemRow: React.FC<EditableItemRowProps> = ({
  item,
  editedData,
  group,
  itemTotals,
  itemAnnualTotal,
  itemPercentage,
  isEditing,
  onUpdateField,
  onDeleteItem,
  onApplyColor,
  isColorModeActive = false,
}) => {
  const isReceita = isReceitaGroupByType(group.type);
  const isInvestmentItem = group.type === 'investimento' || item.id.startsWith('investimento-');

  const getPercentageColorClass = () => {
    return isReceita 
      ? "text-green-600 dark:text-green-400" 
      : "text-red-600 dark:text-red-400";
  };

  // Obter cores originais do item
  const originalColors = Array(12).fill(null) as (string | null)[];
  if (item.values) {
    item.values.forEach((value) => {
      if (value.month >= 0 && value.month < 12) {
        originalColors[value.month] = value.color || null;
      }
    });
  }
  
  // Usar dados editados se disponíveis, senão usar dados originais
  const displayData = editedData || {
    id: item.id,
    name: item.name,
    significado: item.significado,
    rank: item.rank,
    monthlyValues: itemTotals,
    monthlyColors: originalColors,
  };
  
  // Usar cores dos dados editados se disponíveis, senão usar cores originais
  const monthlyColors = editedData?.monthlyColors || originalColors;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateField(item.id, "name", e.target.value);
  };

  const handleSignificadoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateField(item.id, "significado", e.target.value || null);
  };

  const handleRankChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
    onUpdateField(item.id, "rank", value);
  };

  const handleMonthlyValueChange = (monthIndex: number, value: number) => {
    onUpdateField(item.id, "monthlyValue", value, monthIndex);
  };

  // Calcular total anual a partir dos valores mensais editados
  const calculatedAnnualTotal = displayData.monthlyValues.reduce((sum, val) => sum + val, 0);

  return (
    <TableRow className={`hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${isEditing ? 'bg-blue-50/30 dark:bg-blue-900/20' : ''}`}>
      <TableCell className="px-2 py-2 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-xs w-32">
        {isEditing && !isInvestmentItem ? (
          <input
            type="text"
            value={displayData.name}
            onChange={handleNameChange}
            className="w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        ) : (
          <span>{displayData.name || ''}</span>
        )}
      </TableCell>
      
      <TableCell className="px-2 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-40">
        {isEditing && !isInvestmentItem ? (
          <input
            type="text"
            value={displayData.significado || ''}
            onChange={handleSignificadoChange}
            placeholder="Significado"
            className="w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        ) : (
          <span>{displayData.significado || '-'}</span>
        )}
      </TableCell>
      
      <TableCell className="px-2 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-16 text-center">
        {isEditing && !isInvestmentItem ? (
          <input
            type="number"
            value={displayData.rank || ''}
            onChange={handleRankChange}
            placeholder="Rank"
            className="w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-center"
          />
        ) : (
          <span>{displayData.rank || '-'}</span>
        )}
      </TableCell>
      
      <TableCell className={`px-2 py-2 font-normal border border-gray-100 dark:border-white/[0.05] text-xs w-16 text-right ${getPercentageColorClass()}`}>
        {group.name === 'Investimentos' ? '-' : (itemPercentage > 0 ? formatPercent(itemPercentage) : '-')}
      </TableCell>
      
      {isEditing && !isInvestmentItem ? (
        displayData.monthlyValues.map((value, index) => {
          const cellColor = monthlyColors[index] || null;
          const handleCellClick = () => {
            if (isColorModeActive && onApplyColor) {
              onApplyColor(item.id, index);
            }
          };
          
          return (
            <TableCell
              key={index}
              className={`px-1 py-2 font-normal border border-gray-100 dark:border-white/[0.05] text-xs w-12 ${
                isColorModeActive
                  ? "cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                  : ""
              }`}
            >
              <div
                onClick={handleCellClick}
                className={isColorModeActive ? "cursor-pointer" : ""}
              >
                <CurrencyInput
                  value={value}
                  onChange={(newValue) => handleMonthlyValueChange(index, newValue)}
                  className="text-right"
                  style={cellColor ? { color: cellColor } : undefined}
                  onClick={(e) => {
                    if (isColorModeActive && onApplyColor) {
                      e.stopPropagation();
                      onApplyColor(item.id, index);
                    }
                  }}
                />
              </div>
            </TableCell>
          );
        })
      ) : (
        itemTotals.map((value, index) => {
          const cellColor = monthlyColors[index] || null;
          return (
            <TableCell
              key={index}
              className="px-1 py-2 font-normal text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-gray-400 w-12 text-right"
            >
              <span style={cellColor ? { color: cellColor } : undefined}>
                {formatCurrency(value || 0)}
              </span>
            </TableCell>
          );
        })
      )}
      
      <TableCell className="px-2 py-2 font-semibold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
        {formatCurrency(isEditing ? calculatedAnnualTotal : itemAnnualTotal)}
      </TableCell>
      
      {isEditing && !isInvestmentItem && (
        <TableCell className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-8 text-center">
          <DeleteItemButton onClick={() => onDeleteItem(item.id)} />
        </TableCell>
      )}
    </TableRow>
  );
};

