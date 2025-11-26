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
  
  // Identificar se é o grupo principal "Entradas" (sem parentId)
  const isMainEntradasGroup = group.name === 'Entradas' && !group.parentId;
  // Identificar se é o grupo principal "Despesas" (sem parentId)
  const isMainDespesasGroup = group.name === 'Despesas' && !group.parentId;
  // Identificar se é "Entradas Fixas" ou "Entradas Variáveis" para aplicar estilo especial
  const isEntradasFixasOrVariaveis = group.name === 'Entradas Fixas' || group.name === 'Entradas Variáveis';
  // Identificar se é "Despesas Fixas" ou "Despesas Variáveis" para aplicar estilo especial
  const isDespesasFixasOrVariaveis = group.name === 'Despesas Fixas' || group.name === 'Despesas Variáveis';
  // Identificar se é "Sem Tributação" ou "Com Tributação" para aplicar estilo especial
  const isTributacaoGroup = group.name === 'Sem Tributação' || group.name === 'Com Tributação';
  // Identificar "Despesas Empresa" para aplicar estilo especial
  const isDespesasEmpresa = group.name === 'Despesas Empresa';
  // Identificar "Planejamento Financeiro" para aplicar estilo especial
  const isPlanejamentoFinanceiro = group.name === 'Planejamento Financeiro';
  // Identificar "Investimentos" (Aportes/Resgates) para aplicar estilo especial
  const isInvestimentosGroup = group.name === 'Investimentos';
  // Identificar outros subgrupos de despesas fixas para aplicar estilo especial
  const isDespesasFixasSubgroup = [
    'Habitação',
    'Transporte',
    'Saúde',
    'Educação',
    'Animais de Estimação',
    'Despesas Pessoais',
    'Lazer',
    'Impostos'
  ].includes(group.name);
  
  const getDisplayName = () => {
    if (group.name === 'Investimentos') {
      return 'Aportes/Resgates';
    }
    if (isMainEntradasGroup) {
      return 'Total de Entradas';
    }
    if (isMainDespesasGroup) {
      return 'Despesas Fixas e Variáveis';
    }
    return group.name;
  };

  return (
    <TableRow 
      className={`h-6 ${isMainEntradasGroup 
        ? "bg-[#244062] text-white w-full" 
        : isMainDespesasGroup
        ? "bg-[#800000] text-white w-full"
        : isEntradasFixasOrVariaveis
        ? "bg-[#366092] text-white w-full"
        : isDespesasFixasOrVariaveis
        ? "bg-[#CC3300] text-white w-full"
        : isTributacaoGroup
        ? "bg-[#808080] text-white w-full"
        : isDespesasEmpresa
        ? "bg-[#16365C] text-white w-full"
        : isPlanejamentoFinanceiro
        ? "bg-[#9E8A58] text-white w-full"
        : isInvestimentosGroup
        ? "bg-[#76933C] text-white w-full"
        : isDespesasFixasSubgroup
        ? "bg-[#404040] text-white w-full"
        : getBackgroundColor()}`}
      style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}
    >
      <TableCell className={`px-2 font-bold border-t border-b border-l border-black dark:border-black w-32 text-left h-6 text-xs leading-6 ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'text-white align-middle' : ''}`}>
        <div className={`flex items-center gap-2 ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'h-6' : ''}`}>
          <CollapseButton 
            isCollapsed={isCollapsed} 
            onClick={onToggleCollapse} 
            groupName={group.name} 
          />
          <span className={`text-xs ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'text-white' : getGroupNameColorClass()}`}>{getDisplayName()}</span>
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
      <TableCell className={`px-2 text-xs font-bold border-t border-b border-black dark:border-black w-40 h-6 leading-6 align-middle ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'text-white' : ''}`}>
        -
      </TableCell>
      <TableCell className={`px-2 text-xs font-bold text-center border-t border-b border-black dark:border-black w-16 h-6 leading-6 align-middle ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'text-white' : ''}`}>
        -
      </TableCell>
      <TableCell className={`px-2 text-xs font-bold text-right w-16 border-t border-b border-r border-black dark:border-black h-6 leading-6 align-middle ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'text-white' : getPercentageColorClass()}`}>
        {group.name === 'Investimentos' ? '-' : (groupPercentage > 0 ? formatPercent(groupPercentage) : '-')}
      </TableCell>
      {groupTotals.map((value, index) => (
        <TableCell key={index} className={`px-1 text-xs font-bold text-right w-12 border border-black dark:border-black h-6 leading-6 align-middle ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'text-white' : 'text-blue-900 dark:text-blue-100'}`}>
          {formatCurrency(value || 0)}
        </TableCell>
      ))}
      <TableCell className={`px-2 text-xs font-bold text-right w-16 border border-black dark:border-black h-6 leading-6 align-middle ${(isMainEntradasGroup || isMainDespesasGroup || isEntradasFixasOrVariaveis || isDespesasFixasOrVariaveis || isTributacaoGroup || isDespesasEmpresa || isPlanejamentoFinanceiro || isInvestimentosGroup || isDespesasFixasSubgroup) ? 'text-white' : 'text-blue-900 dark:text-blue-100'}`}>
        {formatCurrency(groupAnnualTotal)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-black dark:border-black w-8 h-6 leading-6 align-middle"></TableCell>
      )}
    </TableRow>
  );
}; 