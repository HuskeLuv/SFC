import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowGroup } from "@/types/cashflow";
import { formatCurrency, formatPercent, isReceitaGroupByType } from "@/utils/formatters";
import { CollapseButton } from "./CollapseButton";
import { AddRowButton } from "./AddRowButton";
import { EditButton } from "./EditButton";
import { SaveCancelButtons } from "./SaveCancelButtons";

import { ColorOption } from "./ColorPickerButton";

interface GroupHeaderProps {
  group: CashflowGroup;
  isCollapsed: boolean;
  groupTotals: number[];
  groupAnnualTotal: number;
  groupPercentage: number;
  onToggleCollapse: () => void;
  onAddRow: () => void;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  showActionsColumn?: boolean;
  selectedColor?: ColorOption | null;
  onColorSelect?: (color: ColorOption | null) => void;
}

export const GroupHeader: React.FC<GroupHeaderProps> = ({ 
  group, 
  isCollapsed, 
  groupTotals, 
  groupAnnualTotal, 
  groupPercentage,
  onToggleCollapse, 
  onAddRow,
  isEditing = false,
  onStartEdit,
  onSave,
  onCancel,
  saving = false,
  showActionsColumn = false,
  selectedColor = null,
  onColorSelect,
}) => {
  // Determinar o nível de indentação baseado na hierarquia
  const indentLevel = group.parentId ? (group.children?.length ? 2 : 3) : 1;
  const indentClass = `ml-${indentLevel * 2}`;
  
  // Determinar a cor baseada no nível
  const getBackgroundColor = () => {
    // Cores específicas para Despesas Fixas e Despesas Variáveis
    if (group.name === 'Despesas Fixas' || group.name === 'Despesas Variáveis') {
      return "bg-red-100 dark:bg-red-900"; // Cor vermelha para despesas
    }
    // Trocar cores entre Entradas Fixas e Entradas Variáveis
    if (group.name === 'Entradas Fixas') {
      return "bg-green-100 dark:bg-green-900"; // Cor que era de Entradas Variáveis
    }
    if (group.name === 'Entradas Variáveis') {
      return "bg-blue-100 dark:bg-blue-900"; // Cor que era de Entradas Fixas (ou outra cor)
    }
    if (!group.parentId) return "bg-blue-100 dark:bg-blue-900"; // Grupo principal
    if (group.children?.length) return "bg-green-100 dark:bg-green-900"; // Subgrupo
    return "bg-gray-100 dark:bg-gray-800"; // Grupo final
  };

  const getPercentageColorClass = () => {
    const isReceita = isReceitaGroupByType(group.type);
    return isReceita 
      ? "text-green-600 dark:text-green-400" 
      : "text-red-600 dark:text-red-400";
  };

  const getGroupNameColorClass = () => {
    if (group.name === 'Despesas') {
      return "text-red-700 dark:text-red-300";
    }
    const isReceita = isReceitaGroupByType(group.type);
    return isReceita 
      ? "text-green-700 dark:text-green-300" 
      : "text-blue-900 dark:text-blue-100";
  };
  
  const getDisplayName = () => {
    if (group.name === 'Investimentos') {
      return 'Aportes/Resgates';
    }
    return group.name;
  };

  return (
    <TableRow className={getBackgroundColor()}>
      <TableCell className="px-2 py-2 font-bold text-sm border border-black dark:border-black w-32 text-left">
        <div className="flex items-center gap-2">
          <CollapseButton 
            isCollapsed={isCollapsed} 
            onClick={onToggleCollapse} 
            groupName={group.name} 
          />
          <span className={`text-xs ${getGroupNameColorClass()}`}>{getDisplayName()}</span>
          {!isCollapsed && !group.children?.length && group.name !== 'Investimentos' && !isEditing && (
            <AddRowButton 
              onClick={onAddRow} 
              groupName={group.name}
            />
          )}
          {!isCollapsed && !group.children?.length && group.name !== 'Investimentos' && !isEditing && onStartEdit && (
            <EditButton onClick={onStartEdit} />
          )}
          {isEditing && onSave && onCancel && (
            <SaveCancelButtons 
              onSave={onSave} 
              onCancel={onCancel} 
              saving={saving}
              selectedColor={selectedColor ?? null}
              onColorSelect={onColorSelect ?? undefined}
            />
          )}
        </div>
      </TableCell>
      <TableCell className="px-2 py-2 text-xs font-bold border border-black dark:border-black w-40">
        -
      </TableCell>
      <TableCell className="px-2 py-2 text-xs font-bold text-center border border-black dark:border-black w-16">
        -
      </TableCell>
      <TableCell className={`px-2 py-2 text-xs font-bold text-right w-16 border border-black dark:border-black ${getPercentageColorClass()}`}>
        {group.name === 'Investimentos' ? '-' : (groupPercentage > 0 ? formatPercent(groupPercentage) : '-')}
      </TableCell>
      {groupTotals.map((value, index) => (
        <TableCell key={index} className="px-1 py-2 text-xs font-bold text-right w-12 text-blue-900 dark:text-blue-100 border border-black dark:border-black">
          {formatCurrency(value || 0)}
        </TableCell>
      ))}
      <TableCell className="px-2 py-2 text-xs font-bold text-right w-16 text-blue-900 dark:text-blue-100 border border-black dark:border-black">
        {formatCurrency(groupAnnualTotal)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 py-2 border border-black dark:border-black w-8"></TableCell>
      )}
    </TableRow>
  );
}; 