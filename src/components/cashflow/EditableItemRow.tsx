import React from 'react';
import { TableRow } from '@/components/ui/table';
import { CashflowItem, CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { CurrencyInput } from './CurrencyInput';
import { DeleteItemButton } from './DeleteItemButton';
import { EditableItemData } from '@/hooks/useGroupEditMode';
import { CommentIndicator } from './CommentIndicator';
import { FixedCell, MonthCell, AnnualCell } from './GridCells';
import { GRID, currentMonthIndex } from './cashflowGridStyles';
import { isInvestment } from '@/lib/cashflow/itemCapabilities';

interface EditableItemRowProps {
  item: CashflowItem;
  editedData: EditableItemData | null;
  group: CashflowGroup;
  itemTotals: number[];
  itemAnnualTotal: number;
  itemPercentage: number;
  isEditing: boolean;
  onUpdateField: (
    itemId: string,
    field: 'name' | 'significado' | 'rank' | 'monthlyValue' | 'monthlyFormula',
    value: string | number | null,
    monthIndex?: number,
  ) => void;
  onDeleteItem: (itemId: string) => void;
  onApplyColor?: (itemId: string, monthIndex: number) => void;
  isColorModeActive?: boolean;
  isCommentModeActive?: boolean;
  onCommentCellClick?: (itemId: string, monthIndex: number) => void;
  currentYear?: number;
  /**
   * Linha vinculada a um sonho (🎯): nome/significado/rank/exclusão são da fonte
   * (o sonho) e ficam travados, mas valores e cores SEGUEM editáveis — é assim
   * que o cliente lança o aporte realizado e pinta de verde ("Recebido").
   */
  objetivoLocked?: boolean;
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
  isCommentModeActive = false,
  onCommentCellClick,
  currentYear = new Date().getFullYear(),
  objetivoLocked = false,
}) => {
  const isInvestmentItem = isInvestment(group, item);
  // Sonho com ativos da carteira vinculados: realizado é 100% derivado das
  // transações — valores/cores ficam somente-leitura (o batch-update rejeita).
  const autoRealizado = !!item.objetivoAutoRealizado;
  // Campos estruturais editáveis? (não em linha de investimento nem de sonho)
  const canEditStructure = isEditing && !isInvestmentItem && !objetivoLocked;
  const canEditValues = isEditing && !isInvestmentItem && !autoRealizado;
  // Excluir é permitido também em linha de sonho (propaga pro Planejamento, com
  // confirmação); só não em linha de investimento (calculada).
  const canDelete = isEditing && !isInvestmentItem;

  const handleDeleteClick = () => {
    if (
      objetivoLocked &&
      !window.confirm(
        'Esta linha é um sonho do Planejamento. Excluir aqui também remove o objetivo e todo o histórico dele. Continuar?',
      )
    ) {
      return;
    }
    onDeleteItem(item.id);
  };

  // Cores, fórmulas e comentários originais por mês (índice único; evita 12
  // finds por linha a cada render).
  const originalColors = Array(12).fill(null) as (string | null)[];
  const originalFormulas = Array(12).fill(null) as (string | null)[];
  const commentsByMonth = Array(12).fill(null) as (string | null)[];
  for (const value of item.values ?? []) {
    if (value.month < 0 || value.month >= 12) continue;
    originalColors[value.month] = value.color || null;
    originalFormulas[value.month] = value.formula || null;
    if (value.year === currentYear) commentsByMonth[value.month] = value.comment || null;
  }

  // Usar dados editados se disponíveis, senão usar dados originais
  const displayData = editedData || {
    id: item.id,
    name: item.name,
    significado: item.significado,
    rank: item.rank,
    monthlyValues: itemTotals,
    monthlyColors: originalColors,
    monthlyFormulas: originalFormulas,
  };
  const monthlyColors = editedData?.monthlyColors || originalColors;
  const monthlyFormulas = editedData?.monthlyFormulas || originalFormulas;

  // Blur de célula em modo fórmula: grava o valor calculado + a fórmula (ou
  // null, quando o usuário voltou a digitar número puro).
  const handleMonthlyFormulaChange = (
    monthIndex: number,
    formula: string | null,
    value: number,
  ) => {
    onUpdateField(item.id, 'monthlyValue', value, monthIndex);
    onUpdateField(item.id, 'monthlyFormula', formula, monthIndex);
  };

  // Calcular total anual a partir dos valores mensais editados
  const calculatedAnnualTotal = displayData.monthlyValues.reduce((sum, val) => sum + val, 0);

  // Linha de investimento (calculada) não entra em edição: mantém o fundo normal.
  const rowBg = isEditing && !isInvestmentItem ? GRID.editingBg : GRID.rowBg;
  const cellModeActive = isCommentModeActive || isColorModeActive;
  const cellModeClass = cellModeActive
    ? 'cursor-pointer hover:bg-[#0079F2]/[0.10] transition-colors'
    : '';
  const currentMonth = currentMonthIndex(currentYear);

  const handleCellAction = (index: number) => {
    if (isCommentModeActive && onCommentCellClick) onCommentCellClick(item.id, index);
    else if (isColorModeActive && onApplyColor) onApplyColor(item.id, index);
  };

  const renderComment = (index: number) =>
    commentsByMonth[index] ? (
      <CommentIndicator
        comment={commentsByMonth[index]!}
        itemName={item.name}
        month={index}
        year={currentYear}
      />
    ) : null;

  return (
    <TableRow className={`${GRID.row} ${rowBg}`}>
      <FixedCell col={0} className={`font-medium text-gray-800 dark:text-gray-100 ${rowBg}`}>
        {/* Nome + botão de excluir na mesma célula: sem coluna "Ações" que
            aparecia/sumia ao entrar e sair da edição. */}
        <div className="flex items-center gap-1 h-7">
          {canEditStructure ? (
            <input
              type="text"
              size={1}
              value={displayData.name}
              onChange={(e) => onUpdateField(item.id, 'name', e.target.value)}
              aria-label="Nome do item"
              className={`flex-1 min-w-0 ${GRID.input}`}
            />
          ) : (
            <span className="truncate block flex-1 min-w-0">
              {objetivoLocked ? (
                <span
                  className="mr-1"
                  title={
                    autoRealizado
                      ? 'Sonho com ativos vinculados — o realizado vem automaticamente da carteira'
                      : 'Linha vinculada a um sonho — edite o nome no Planejamento de Sonhos'
                  }
                >
                  🎯
                </span>
              ) : null}
              {displayData.name || ''}
            </span>
          )}
          {canDelete && (
            <span className="flex-shrink-0">
              <DeleteItemButton onClick={handleDeleteClick} />
            </span>
          )}
        </div>
      </FixedCell>

      <FixedCell col={1} className={`text-gray-500 dark:text-gray-400 ${rowBg}`}>
        {canEditStructure ? (
          <input
            type="text"
            size={1}
            value={displayData.significado || ''}
            onChange={(e) => onUpdateField(item.id, 'significado', e.target.value || null)}
            placeholder="O seu porquê"
            aria-label="O seu porquê"
            className={GRID.input}
          />
        ) : (
          <span className="truncate block">{displayData.significado || ''}</span>
        )}
      </FixedCell>

      <FixedCell col={2} className={`text-center text-gray-500 dark:text-gray-400 ${rowBg}`}>
        {canEditStructure ? (
          <input
            type="text"
            size={1}
            value={displayData.rank || ''}
            onChange={(e) =>
              onUpdateField(item.id, 'rank', e.target.value === '' ? null : e.target.value)
            }
            placeholder="Nível"
            aria-label="Nível de prioridade"
            className={`${GRID.input} text-center`}
          />
        ) : (
          <span>{displayData.rank || ''}</span>
        )}
      </FixedCell>

      <FixedCell col={3} className={`text-right tabular-nums ${rowBg}`}>
        {group.name !== 'Investimentos' && itemPercentage > 0 ? formatPercent(itemPercentage) : ''}
      </FixedCell>

      {canEditValues
        ? displayData.monthlyValues.map((value, index) => {
            const cellColor = monthlyColors[index] || null;
            return (
              <MonthCell
                key={index}
                index={index}
                currentMonth={currentMonth}
                className={cellModeClass}
                style={{ overflow: 'visible' }}
              >
                <div
                  onClick={() => handleCellAction(index)}
                  className={`flex items-center justify-end gap-1 ${cellModeActive ? 'cursor-pointer' : ''}`}
                  style={{ position: 'relative', overflow: 'visible' }}
                >
                  {renderComment(index)}
                  <CurrencyInput
                    value={value}
                    onChange={(newValue) => onUpdateField(item.id, 'monthlyValue', newValue, index)}
                    formula={monthlyFormulas[index]}
                    onFormulaChange={(formula, newValue) =>
                      handleMonthlyFormulaChange(index, formula, newValue)
                    }
                    className="text-right"
                    style={cellColor ? { color: cellColor } : undefined}
                    onClick={(e) => {
                      if (cellModeActive) {
                        e.stopPropagation();
                        handleCellAction(index);
                      }
                    }}
                  />
                </div>
              </MonthCell>
            );
          })
        : itemTotals.map((value, index) => {
            const cellColor = monthlyColors[index] || null;
            return (
              <MonthCell
                key={index}
                index={index}
                currentMonth={currentMonth}
                style={{ overflow: 'visible' }}
              >
                <div
                  className="flex items-center justify-end gap-1"
                  style={{ position: 'relative', overflow: 'visible' }}
                >
                  {renderComment(index)}
                  <span style={cellColor ? { color: cellColor } : undefined}>
                    {formatCurrency(value || 0)}
                  </span>
                </div>
              </MonthCell>
            );
          })}

      <AnnualCell className={`text-gray-800 dark:text-gray-100 ${rowBg}`}>
        {formatCurrency(isEditing ? calculatedAnnualTotal : itemAnnualTotal)}
      </AnnualCell>
    </TableRow>
  );
};
