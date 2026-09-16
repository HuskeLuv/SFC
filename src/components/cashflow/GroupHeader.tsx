import React from 'react';
import Link from 'next/link';
import { TableRow } from '@/components/ui/table';
import { CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent, isReceitaGroupByType } from '@/utils/formatters';
import { CollapseButton } from './CollapseButton';
import { AddRowButton } from './AddRowButton';
import { EditButton } from './EditButton';
import { SaveCancelButtons } from './SaveCancelButtons';
import { ColorOption } from './ColorPickerButton';
import { FixedCell, MonthCell, AnnualCell, SpacerCell, ActionsCell } from './GridCells';
import { GRID } from './cashflowGridStyles';
import { CANONICAL_GROUPS, canonicalName } from '@/services/cashflow/groupMatchers';
import { TABLE_HEADER_BG } from '@/constants/brandColors';

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

const DESPESAS_FIXAS_SUBGROUPS = [
  'Habitação',
  'Transporte',
  'Saúde',
  'Educação',
  'Animais de Estimação',
  'Despesas Pessoais',
  'Lazer',
  'Impostos',
  'Despesas com Dependentes',
  // Ex-"Dívidas" (linhas-espelho de financiamentos): sem esta entrada o
  // cabeçalho caía no estilo genérico azul e parecia de outra seção.
  'Despesas Financeiras',
  'Dívidas',
];

// Formatação condicional do % Receita da linha "Despesas Fixas e Variáveis" —
// faixas do ticket QA 19/08/2026: ≤80% azul · (80,90]% amarelo · (90,100]%
// vermelho claro · >100% vermelho forte. Ajuste QA 21/08: a CÉLULA inteira
// ganha o fundo da faixa (como na planilha) — só o número colorido ficava
// "apagado" na linha #800000. Texto branco/preto conforme o contraste.
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
  const isDespesasFixasSubgroup = DESPESAS_FIXAS_SUBGROUPS.includes(canonical);

  const displayName = isInvestimentosGroup
    ? 'Aporte/Resgate'
    : isMainEntradasGroup
      ? 'Total de Entradas'
      : isMainDespesasGroup
        ? 'Despesas Fixas e Variáveis'
        : group.name;

  // Cor sólida da planilha para grupos estruturais (mesma em light/dark, texto
  // branco); grupos genéricos usam classes com variante dark.
  const solidHex = isMainEntradasGroup
    ? '#244061'
    : isMainDespesasGroup
      ? '#800000'
      : isEntradasFixasOrVariaveis
        ? '#366092'
        : isDespesasFixasOrVariaveis
          ? '#CC3300'
          : isTributacaoGroup
            ? '#7F7F7F'
            : isDespesasEmpresa
              ? '#17365D'
              : isPlanejamentoFinanceiro
                ? TABLE_HEADER_BG
                : isInvestimentosGroup
                  ? // Aporte/Resgate: cinza-claro da planilha, RGB 201,204,204
                    // (ticket 19/08/2026 — era o verde #38761D)
                    '#C9CCCC'
                  : isContaCorrenteGroup
                    ? '#002060'
                    : isDespesasFixasSubgroup
                      ? '#3F3F3F'
                      : null;
  const isSolid = solidHex !== null;

  const genericBgClass = !group.parentId
    ? 'bg-blue-100 dark:bg-blue-900'
    : group.children?.length
      ? 'bg-green-100 dark:bg-green-900'
      : 'bg-gray-100 dark:bg-gray-800';

  const genericNameColorClass =
    canonical === CANONICAL_GROUPS.DESPESAS
      ? 'text-red-700 dark:text-red-300'
      : isReceitaGroupByType(group.type)
        ? 'text-green-700 dark:text-green-300'
        : 'text-blue-900 dark:text-blue-100';

  // Aporte/Resgate tem fundo claro → escrito preto (as demais sólidas são
  // escuras e mantêm texto branco).
  const solidTextClass = isInvestimentosGroup ? 'text-black' : 'text-white';
  const textClass = isSolid ? solidTextClass : '';
  const valueTextClass = isSolid ? solidTextClass : 'text-blue-900 dark:text-blue-100';
  const stickyBgClass = isSolid ? '' : genericBgClass;
  const stickyBgStyle = solidHex ? { backgroundColor: solidHex } : undefined;

  const canMutateRows = !isCollapsed && !group.children?.length && !isInvestimentosGroup;

  const percentConditionalStyle =
    isMainDespesasGroup && groupPercentage > 0 ? despesasPercentStyle(groupPercentage) : undefined;

  const fixedCell = (
    col: 0 | 1 | 2 | 3,
    content: React.ReactNode,
    extraClass: string,
    extraStyle?: React.CSSProperties,
  ) => (
    <FixedCell
      col={col}
      frame="framed"
      className={`font-bold align-middle ${extraClass} ${stickyBgClass}`}
      // z-index acima das linhas de item (30/20/10) para a linha de grupo
      // "passar por cima" ao rolar; crescente para cobrir as emendas.
      style={{ ...stickyBgStyle, zIndex: 55 + col, ...extraStyle }}
    >
      {content}
    </FixedCell>
  );

  return (
    <TableRow
      className={`${GRID.row} w-full ${isSolid ? solidTextClass : genericBgClass}`}
      style={{ ...GRID.rowStyle, ...stickyBgStyle }}
    >
      {fixedCell(
        0,
        <div className={`flex items-center gap-1 ${isSolid ? 'h-6' : ''}`}>
          <CollapseButton
            isCollapsed={isCollapsed}
            onClick={onToggleCollapse}
            groupName={group.name}
          />
          {isPlanejamentoFinanceiro ? (
            <Link
              href="/planejamento-financeiro"
              className={`text-xs truncate flex-1 hover:underline ${isSolid ? solidTextClass : genericNameColorClass}`}
              title="Abrir o Planejamento de Sonhos"
            >
              {displayName} <span aria-hidden>↗</span>
            </Link>
          ) : (
            <span
              className={`text-xs truncate flex-1 ${isSolid ? solidTextClass : genericNameColorClass}`}
              title={displayName}
            >
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
        </div>,
        `text-left ${textClass}`,
      )}
      {fixedCell(1, '-', textClass)}
      {fixedCell(2, '-', `text-center ${textClass}`)}
      {fixedCell(
        3,
        isInvestimentosGroup || isContaCorrenteGroup
          ? '-'
          : groupPercentage > 0
            ? formatPercent(groupPercentage)
            : '-',
        `text-right ${isSolid ? solidTextClass : 'text-black dark:text-gray-300'}`,
        percentConditionalStyle,
      )}
      {groupTotals.map((value, index) => (
        <MonthCell key={index} index={index} variant="bold" className={valueTextClass}>
          {formatCurrency(value || 0)}
        </MonthCell>
      ))}
      <SpacerCell />
      <AnnualCell variant="bold" className={valueTextClass}>
        {formatCurrency(groupAnnualTotal)}
      </AnnualCell>
      {showActionsColumn && <ActionsCell />}
    </TableRow>
  );
};
