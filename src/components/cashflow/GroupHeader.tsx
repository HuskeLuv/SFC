import React from 'react';
import Link from 'next/link';
import { TableRow } from '@/components/ui/table';
import { CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { CollapseButton } from './CollapseButton';
import { AddRowButton } from './AddRowButton';
import { EditButton } from './EditButton';
import { SaveCancelButtons } from './SaveCancelButtons';
import { ColorOption } from './ColorPickerButton';
import { FixedCell, MonthCell, AnnualCell } from './GridCells';
import { GRID, SECTION_CLASS } from './cashflowGridStyles';
import { groupLevel } from './groupLevel';
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
  selectedColor?: ColorOption | null;
  onColorSelect?: (color: ColorOption | null) => void;
  isCommentModeActive?: boolean;
  onCommentClick?: () => void;
}

// Formatação condicional do % Receita da linha "Despesas Fixas e Variáveis" —
// faixas do ticket QA 19/08/2026: ≤80% azul · (80,90]% amarelo · (90,100]%
// vermelho claro · >100% vermelho forte. Ajuste QA 21/08: a CÉLULA inteira
// ganha o fundo da faixa (como na planilha). Semântico — fica fora da paleta.
const despesasPercentStyle = (pct: number): React.CSSProperties => {
  if (pct <= 80) return { backgroundColor: '#2E7DFF', color: '#FFFFFF' };
  if (pct <= 90) return { backgroundColor: '#FFD54D', color: '#000000' };
  if (pct <= 100) return { backgroundColor: '#FF9B9B', color: '#000000' };
  return { backgroundColor: '#FF0000', color: '#FFFFFF' };
};

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
  const isMainEntradasGroup = canonical === CANONICAL_GROUPS.ENTRADAS && !group.parentId;
  const isMainDespesasGroup = canonical === CANONICAL_GROUPS.DESPESAS && !group.parentId;
  const isPlanejamentoFinanceiro = canonical === 'Planejamento Financeiro';
  // Aporte/Resgate: itens são calculados da carteira (read-only, sem add/edit)
  const isInvestimentosGroup = group.type === 'investimento';
  // Conta Corrente: bloco de saldo manual (editável)
  const isContaCorrenteGroup = group.type === 'saldo';

  const displayName = isInvestimentosGroup
    ? 'Aporte/Resgate'
    : isMainEntradasGroup
      ? 'Total de Entradas'
      : isMainDespesasGroup
        ? 'Despesas Fixas e Variáveis'
        : group.name;

  const sectionClass = isInvestimentosGroup
    ? SECTION_CLASS.aporte
    : SECTION_CLASS[groupLevel(group)];

  const canMutateRows = !isCollapsed && !group.children?.length && !isInvestimentosGroup;

  const percentConditionalStyle =
    isMainDespesasGroup && groupPercentage > 0 ? despesasPercentStyle(groupPercentage) : undefined;

  return (
    <TableRow className={`${GRID.row} font-semibold ${sectionClass}`}>
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
      </FixedCell>
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
      {groupTotals.map((value, index) => (
        <MonthCell key={index} index={index}>
          {formatCurrency(value || 0)}
        </MonthCell>
      ))}
      <AnnualCell className={sectionClass}>{formatCurrency(groupAnnualTotal)}</AnnualCell>
    </TableRow>
  );
};
