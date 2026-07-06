import React from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent, isReceitaGroupByType } from '@/utils/formatters';
import { CollapseButton } from './CollapseButton';
import { AddRowButton } from './AddRowButton';
import { EditButton } from './EditButton';
import { SaveCancelButtons } from './SaveCancelButtons';
import { ColorOption } from './ColorPickerButton';
import { FIXED_COLUMN_BODY_STYLES } from './fixedColumns';
import { CANONICAL_GROUPS, canonicalName } from '@/services/cashflow/groupMatchers';

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
  isCommentModeActive?: boolean;
  onCommentClick?: () => void;
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
  isCommentModeActive = false,
  onCommentClick,
}) => {
  // Identificação pelo nome CANÔNICO do template (sobrevive a renomeações) e
  // pelo type quando estrutural (investimento/saldo).
  const canonical = canonicalName(group);
  const isMainEntradasGroup = canonical === CANONICAL_GROUPS.ENTRADAS && !group.parentId;
  const isMainDespesasGroup = canonical === CANONICAL_GROUPS.DESPESAS && !group.parentId;
  const isEntradasFixasOrVariaveis =
    canonical === CANONICAL_GROUPS.ENTRADAS_FIXAS ||
    canonical === CANONICAL_GROUPS.ENTRADAS_VARIAVEIS;
  const isDespesasFixasOrVariaveis =
    canonical === CANONICAL_GROUPS.DESPESAS_FIXAS ||
    canonical === CANONICAL_GROUPS.DESPESAS_VARIAVEIS;
  const isTributacaoGroup = canonical === 'Sem Tributação' || canonical === 'Com Tributação';
  const isDespesasEmpresa = canonical === 'Despesas Empresa';
  const isPlanejamentoFinanceiro = canonical === 'Planejamento Financeiro';
  // Aporte/Resgate: itens são calculados da carteira (read-only, sem add/edit)
  const isInvestimentosGroup = group.type === 'investimento';
  // Conta Corrente: bloco de saldo manual (editável)
  const isContaCorrenteGroup = group.type === 'saldo';
  const isDespesasFixasSubgroup = [
    'Habitação',
    'Transporte',
    'Saúde',
    'Educação',
    'Animais de Estimação',
    'Despesas Pessoais',
    'Lazer',
    'Impostos',
  ].includes(canonical);

  const getDisplayName = () => {
    if (isInvestimentosGroup) return 'Aporte/Resgate';
    if (isMainEntradasGroup) return 'Total de Entradas';
    if (isMainDespesasGroup) return 'Despesas Fixas e Variáveis';
    return group.name;
  };

  // Cor sólida da planilha para grupos estruturais (mesma em light/dark, texto
  // branco); grupos genéricos usam classes com variante dark.
  const solidHex = isMainEntradasGroup
    ? '#244062'
    : isMainDespesasGroup
      ? '#800000'
      : isEntradasFixasOrVariaveis
        ? '#366092'
        : isDespesasFixasOrVariaveis
          ? '#CC3300'
          : isTributacaoGroup
            ? '#808080'
            : isDespesasEmpresa
              ? '#16365C'
              : isPlanejamentoFinanceiro
                ? '#9E8A58'
                : isInvestimentosGroup
                  ? '#76933C'
                  : isContaCorrenteGroup
                    ? '#16365C'
                    : isDespesasFixasSubgroup
                      ? '#404040'
                      : null;
  const isSolid = solidHex !== null;

  const genericBgClass = (() => {
    if (!group.parentId) return 'bg-blue-100 dark:bg-blue-900';
    if (group.children?.length) return 'bg-green-100 dark:bg-green-900';
    return 'bg-gray-100 dark:bg-gray-800';
  })();

  const genericNameColorClass = (() => {
    if (canonical === CANONICAL_GROUPS.DESPESAS) return 'text-red-700 dark:text-red-300';
    const isReceita = isReceitaGroupByType(group.type);
    return isReceita ? 'text-green-700 dark:text-green-300' : 'text-blue-900 dark:text-blue-100';
  })();

  const textClass = isSolid ? 'text-white' : '';
  const valueTextClass = isSolid ? 'text-white' : 'text-blue-900 dark:text-blue-100';
  const stickyBgClass = isSolid ? '' : genericBgClass;
  const stickyBgStyle = solidHex ? { backgroundColor: solidHex } : undefined;

  const canMutateRows = !isCollapsed && !group.children?.length && !isInvestimentosGroup;

  return (
    <TableRow
      className={`h-6 w-full ${isSolid ? 'text-white' : genericBgClass}`}
      style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px', ...stickyBgStyle }}
    >
      <TableCell
        className={`px-2 font-bold text-left h-6 text-xs leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0 align-middle ${textClass} ${stickyBgClass}`}
        style={{
          position: 'sticky',
          ...stickyBgStyle,
          ...FIXED_COLUMN_BODY_STYLES[0],
          zIndex: 55,
          overflow: 'hidden',
          flexShrink: 0,
          borderRight: 'none',
        }}
      >
        <div className={`flex items-center gap-1 ${isSolid ? 'h-6' : ''}`}>
          <CollapseButton
            isCollapsed={isCollapsed}
            onClick={onToggleCollapse}
            groupName={group.name}
          />
          <span
            className={`text-xs truncate flex-1 ${isSolid ? 'text-white' : genericNameColorClass}`}
            title={getDisplayName()}
          >
            {getDisplayName()}
          </span>
          {canMutateRows && !isEditing && (
            <AddRowButton onClick={onAddRow} groupName={group.name} />
          )}
          {canMutateRows && !isEditing && onStartEdit && <EditButton onClick={onStartEdit} />}
          {isEditing && onSave && onCancel && (
            <SaveCancelButtons
              onSave={onSave}
              onCancel={onCancel}
              saving={saving}
              selectedColor={selectedColor ?? null}
              onColorSelect={onColorSelect ?? undefined}
              isCommentModeActive={isCommentModeActive}
              onCommentClick={onCommentClick}
            />
          )}
        </div>
      </TableCell>
      <TableCell
        className={`px-2 text-xs font-bold h-6 leading-6 align-middle whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0 ${textClass} ${stickyBgClass}`}
        style={{
          position: 'sticky',
          ...stickyBgStyle,
          ...FIXED_COLUMN_BODY_STYLES[1],
          zIndex: 56,
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        -
      </TableCell>
      <TableCell
        className={`px-2 text-xs font-bold text-center h-6 leading-6 align-middle whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0 ${textClass} ${stickyBgClass}`}
        style={{
          position: 'sticky',
          ...stickyBgStyle,
          ...FIXED_COLUMN_BODY_STYLES[2],
          zIndex: 57,
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        -
      </TableCell>
      <TableCell
        className={`px-2 text-xs font-bold text-right h-6 leading-6 align-middle whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r border-gray-300 ${isSolid ? 'text-white' : 'text-black dark:text-gray-300'} ${stickyBgClass}`}
        style={{
          position: 'sticky',
          ...stickyBgStyle,
          ...FIXED_COLUMN_BODY_STYLES[3],
          zIndex: 58,
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
        }}
      >
        {isInvestimentosGroup || isContaCorrenteGroup
          ? '-'
          : groupPercentage > 0
            ? formatPercent(groupPercentage)
            : '-'}
      </TableCell>
      {groupTotals.map((value, index) => (
        <TableCell
          key={index}
          className={`px-1 text-xs font-bold text-right border-t border-b border-gray-200 border-r border-gray-200 h-6 leading-6 align-middle ${
            index === 0 ? 'border-l-0' : 'border-l border-gray-200'
          } ${valueTextClass}`}
          style={{ minWidth: '3rem' }}
        >
          {formatCurrency(value || 0)}
        </TableCell>
      ))}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 align-middle bg-white dark:bg-gray-900"></TableCell>
      <TableCell
        className={`px-2 text-xs font-bold text-right border-t border-b border-gray-200 border border-gray-200 h-6 leading-6 align-middle ${valueTextClass}`}
        style={{ minWidth: '4rem' }}
      >
        {formatCurrency(groupAnnualTotal)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6 align-middle"></TableCell>
      )}
    </TableRow>
  );
};
