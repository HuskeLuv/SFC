import React from 'react';
import Link from 'next/link';
import { useDroppable } from '@dnd-kit/core';
import { TableRow } from '@/components/ui/table';
import { CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { CollapseButton } from './CollapseButton';
import { EditButton } from './EditButton';
import { SaveCancelButtons } from './SaveCancelButtons';
import { ColorOption } from './ColorPickerButton';
import { FixedCell, MonthCell, AnnualCell } from './GridCells';
import { GRID, SECTION_CLASS } from './cashflowGridStyles';
import { groupLevel } from './groupLevel';
import { FIXED_COLUMNS_1_TO_3_WIDTH } from './fixedColumns';
import { CANONICAL_GROUPS, canonicalName } from '@/services/cashflow/groupMatchers';
import { groupDropId, useDropHint } from './CashflowDnd';
import { DESPESAS_PERCENT_STYLE, groupDisplayName } from '@/lib/cashflow/itemCapabilities';

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
  selectedColor = null,
  onColorSelect,
  isCommentModeActive = false,
  onCommentClick,
}) => {
  // Identificação pelo nome CANÔNICO do template (sobrevive a renomeações) e
  // pelo type quando estrutural (investimento/saldo).
  const canonical = canonicalName(group);
  const isMainDespesasGroup = canonical === CANONICAL_GROUPS.DESPESAS && !group.parentId;
  const isPlanejamentoFinanceiro = canonical === 'Planejamento Financeiro';
  // Aporte/Resgate: itens são calculados da carteira (read-only, sem add/edit)
  const isInvestimentosGroup = group.type === 'investimento';
  // Conta Corrente: bloco de saldo manual (editável)
  const isContaCorrenteGroup = group.type === 'saldo';

  const displayName = groupDisplayName(group);

  const sectionClass = isInvestimentosGroup
    ? SECTION_CLASS.aporte
    : SECTION_CLASS[groupLevel(group)];

  const canMutateRows = !isCollapsed && !group.children?.length && !isInvestimentosGroup;

  // Alvo do drag-and-drop entre seções: soltar no cabeçalho põe a linha no
  // fim do grupo (serve para grupo vazio ou recolhido). Só grupos-folha de
  // lançamento manual, como o "+ Linha".
  const acceptsDrop =
    !isEditing &&
    !isInvestimentosGroup &&
    !isContaCorrenteGroup &&
    !group.children?.length &&
    (group.type === 'entrada' || group.type === 'despesa');
  const { setNodeRef } = useDroppable({
    id: groupDropId(group.id),
    data: {
      groupId: group.id,
      groupName: group.name,
      name: group.name,
      kind: 'grupo',
      acceptsDrop,
    },
    disabled: !acceptsDrop,
  });
  const hint = useDropHint();
  const dropLine = hint?.overId === groupDropId(group.id) ? GRID.dropLineAfter : '';

  const percentConditionalStyle =
    isMainDespesasGroup && groupPercentage > 0
      ? DESPESAS_PERCENT_STYLE(groupPercentage)
      : undefined;

  return (
    <TableRow ref={setNodeRef} className={`${GRID.row} font-semibold ${sectionClass} ${dropLine}`}>
      <FixedCell
        col={0}
        className={sectionClass}
        // z-index acima das linhas de item (30/20/10) para a linha de grupo
        // "passar por cima" ao rolar; crescente para cobrir as emendas.
        style={{ zIndex: 55 }}
      >
        <div className="flex items-center gap-1.5 h-7">
          <CollapseButton
            isCollapsed={isCollapsed}
            onClick={onToggleCollapse}
            groupName={group.name}
          />
          {isPlanejamentoFinanceiro ? (
            <Link
              href="/planejamento-financeiro"
              className="truncate flex-1 hover:underline"
              title="Abrir o Planejamento de Sonhos"
            >
              {displayName} <span aria-hidden>↗</span>
            </Link>
          ) : (
            <span className="truncate flex-1" title={displayName}>
              {displayName}
            </span>
          )}
          {/* Um só botão visível fora da edição; "+ Linha" mora na barra de edição. */}
          {canMutateRows && !isEditing && onStartEdit && <EditButton onClick={onStartEdit} />}
        </div>
      </FixedCell>
      {isEditing && onSave && onCancel ? (
        // Em edição a barra ocupa as colunas 1-3 (vazias na linha de grupo):
        // o nome do grupo fica inteiro e a barra tem espaço para os rótulos.
        <FixedCell
          col={1}
          colSpan={3}
          className={`${GRID.fixedDivider} ${sectionClass}`}
          style={{
            zIndex: 56,
            width: FIXED_COLUMNS_1_TO_3_WIDTH,
            minWidth: FIXED_COLUMNS_1_TO_3_WIDTH,
            maxWidth: FIXED_COLUMNS_1_TO_3_WIDTH,
          }}
        >
          <SaveCancelButtons
            onAddRow={canMutateRows ? onAddRow : undefined}
            groupName={group.name}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
            selectedColor={selectedColor ?? null}
            onColorSelect={onColorSelect ?? undefined}
            isCommentModeActive={isCommentModeActive}
            onCommentClick={onCommentClick}
          />
        </FixedCell>
      ) : (
        <>
          <FixedCell col={1} className={sectionClass} style={{ zIndex: 56 }} />
          <FixedCell col={2} className={sectionClass} style={{ zIndex: 57 }} />
          <FixedCell
            col={3}
            className={`text-right tabular-nums ${sectionClass}`}
            style={{ zIndex: 58, ...percentConditionalStyle }}
          >
            {!isInvestimentosGroup && !isContaCorrenteGroup && groupPercentage > 0
              ? formatPercent(groupPercentage)
              : ''}
          </FixedCell>
        </>
      )}
      {groupTotals.map((value, index) => (
        <MonthCell key={index} index={index}>
          {formatCurrency(value || 0)}
        </MonthCell>
      ))}
      <AnnualCell className={sectionClass}>{formatCurrency(groupAnnualTotal)}</AnnualCell>
    </TableRow>
  );
};
