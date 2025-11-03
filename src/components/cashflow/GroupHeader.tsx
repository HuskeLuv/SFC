import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { CashflowGroup } from "@/types/cashflow";
import { formatCurrency, formatPercent, isReceitaGroupByType } from "@/utils/formatters";
import { CollapseButton } from "./CollapseButton";
import { AddRowButton } from "./AddRowButton";

interface GroupHeaderProps {
  group: CashflowGroup;
  isCollapsed: boolean;
  groupTotals: number[];
  groupAnnualTotal: number;
  groupPercentage: number;
  onToggleCollapse: () => void;
  onAddRow: () => void;
}

export const GroupHeader: React.FC<GroupHeaderProps> = ({ 
  group, 
  isCollapsed, 
  groupTotals, 
  groupAnnualTotal, 
  groupPercentage,
  onToggleCollapse, 
  onAddRow
}) => {
  // Determinar o nível de indentação baseado na hierarquia
  const indentLevel = group.parentId ? (group.children?.length ? 2 : 3) : 1;
  const indentClass = `ml-${indentLevel * 2}`;
  
  // Determinar a cor baseada no nível
  const getBackgroundColor = () => {
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
      return 'Aportes/Resgastes';
    }
    return group.name;
  };

  return (
    <TableRow className={getBackgroundColor()}>
      <TableCell className="px-2 py-2 font-bold text-sm border border-gray-100 dark:border-white/[0.05] w-32">
        <div className="flex items-center gap-2">
          <CollapseButton 
            isCollapsed={isCollapsed} 
            onClick={onToggleCollapse} 
            groupName={group.name} 
          />
          <span className={`text-xs ${indentClass} ${getGroupNameColorClass()}`}>{getDisplayName()}</span>
          {!isCollapsed && !group.children?.length && group.name !== 'Investimentos' && (
            <AddRowButton 
              onClick={onAddRow} 
              groupName={group.name}
            />
          )}
        </div>
      </TableCell>
      <TableCell className={`px-2 py-2 text-xs font-bold text-right w-16 border border-gray-100 dark:border-white/[0.05] ${getPercentageColorClass()}`}>
        {group.name === 'Investimentos' ? '-' : (groupPercentage > 0 ? formatPercent(groupPercentage) : '-')}
      </TableCell>
      {groupTotals.map((value, index) => (
        <TableCell key={index} className="px-1 py-2 text-xs font-bold text-right w-12 text-blue-900 dark:text-blue-100 border border-gray-100 dark:border-white/[0.05]">
          {value ? formatCurrency(value) : '-'}
        </TableCell>
      ))}
      <TableCell className="px-2 py-2 text-xs font-bold text-right w-16 text-blue-900 dark:text-blue-100 border border-gray-100 dark:border-white/[0.05]">
        {formatCurrency(groupAnnualTotal)}
      </TableCell>
    </TableRow>
  );
}; 