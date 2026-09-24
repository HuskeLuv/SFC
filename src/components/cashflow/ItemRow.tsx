import React from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TableRow } from '@/components/ui/table';
import { CashflowItem, CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { CommentIndicator } from './CommentIndicator';
import { FixedCell, MonthCell, AnnualCell } from './GridCells';
import { GRID, currentMonthIndex } from './cashflowGridStyles';
import { useDropHint } from './CashflowDnd';

interface ItemRowProps {
  item: CashflowItem;
  itemTotals: number[];
  itemAnnualTotal: number;
  itemPercentage: number;
  group: CashflowGroup;
  currentYear?: number;
  /**
   * Linha arrastável (alça ⠿): reordena no grupo e, se não for espelho de
   * sonho/dívida, muda de seção. Exige um CashflowDndProvider acima;
   * false = sem alça (grupos calculados).
   */
  reorderable?: boolean;
}

const ItemRowComponent: React.FC<ItemRowProps> = ({
  item,
  itemTotals,
  itemAnnualTotal,
  itemPercentage,
  group,
  currentYear = new Date().getFullYear(),
  reorderable = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: {
      groupId: group.id,
      groupName: group.name,
      name: item.name,
      movable: !item.objetivoId && !item.dividaId,
      acceptsDrop: true,
    },
    disabled: !reorderable,
  });
  // Linha vinda de outro grupo vai entrar aqui: traço azul em cima ou embaixo.
  const hint = useDropHint();
  const dropLine =
    hint?.overId === item.id ? (hint.after ? GRID.dropLineAfter : GRID.dropLineBefore) : '';

  // Índice único por mês (evita 12 finds por linha a cada render).
  const valuesByMonth: Record<number, NonNullable<CashflowItem['values']>[number]> = {};
  for (const v of item.values ?? []) {
    if (v.year === currentYear) valuesByMonth[v.month] = v;
  }

  const isDerived = group.type === 'investimento' || group.type === 'saldo';
  const currentMonth = currentMonthIndex(currentYear);

  return (
    <TableRow
      ref={setNodeRef}
      className={`group/linha ${GRID.row} ${GRID.rowBg} ${dropLine} ${isDragging ? 'opacity-40' : ''}`}
      // Transform/transition do @dnd-kit: as outras linhas abrem espaço no
      // destino enquanto a arrastada segue o mouse (fantasma no DragOverlay).
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <FixedCell
        col={0}
        className={`font-medium text-gray-800 dark:text-gray-100 ${GRID.rowBg}`}
        title={item.name || undefined}
      >
        <span className="cursor-default truncate block">
          {reorderable ? (
            // Alça de arrastar (pedido 16/09/2026): discreta, forte no hover
            // ou foco. touch-none: no celular o toque longo pega a linha sem
            // disparar a rolagem. Teclado: espaço + setas (KeyboardSensor).
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Arrastar ${item.name} para mover`}
              title={
                item.objetivoId || item.dividaId
                  ? 'Arraste para reordenar dentro da seção'
                  : 'Arraste para reordenar ou mover para outra seção'
              }
              className="mr-1 inline-flex cursor-grab touch-none select-none items-center rounded px-0.5 align-middle text-[11px] leading-none text-gray-400 opacity-40 transition-opacity hover:bg-gray-200 hover:text-gray-700 focus:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0079F2] active:cursor-grabbing group-hover/linha:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              ⠿
            </button>
          ) : null}
          {item.objetivoId ? (
            <Link
              href="/planejamento-financeiro"
              className="mr-1"
              title="Linha vinculada a um sonho — abrir o Planejamento de Sonhos"
            >
              🎯
            </Link>
          ) : null}
          {item.dividaId ? (
            <Link
              href="/dividas"
              className="mr-1"
              title="Linha vinculada a uma dívida — abrir a página de Dívidas"
            >
              💳
            </Link>
          ) : null}
          {item.name || ''}
        </span>
      </FixedCell>
      <FixedCell
        col={1}
        className={`text-gray-500 dark:text-gray-400 ${GRID.rowBg}`}
        title={item.significado || undefined}
      >
        <span className="cursor-default truncate block">{item.significado || ''}</span>
      </FixedCell>
      <FixedCell col={2} className={`text-center text-gray-500 dark:text-gray-400 ${GRID.rowBg}`}>
        {group.type === 'investimento' ? '' : item.rank || ''}
      </FixedCell>
      <FixedCell col={3} className={`text-right tabular-nums ${GRID.rowBg}`}>
        {!isDerived && itemPercentage > 0 ? formatPercent(itemPercentage) : ''}
      </FixedCell>
      {itemTotals.map((value, index) => {
        const monthlyValue = valuesByMonth[index];
        // Aporte/Resgate (grupo investimento, automático da carteira):
        // aporte em verde, resgate em vermelho (regra Pedro Haddad).
        const signColor =
          group.type === 'investimento' && value ? (value > 0 ? '#16a34a' : '#dc2626') : null;
        const cellColor = monthlyValue?.color || signColor;
        const cellComment = monthlyValue?.comment || null;

        return (
          <MonthCell
            key={index}
            index={index}
            currentMonth={currentMonth}
            className={`cursor-default ${GRID.rowHover}`}
            style={{ overflow: 'visible' }}
          >
            <div
              className="flex items-center justify-end gap-1"
              style={{ position: 'relative', overflow: 'visible' }}
            >
              {cellComment && (
                <CommentIndicator
                  comment={cellComment}
                  itemName={item.name}
                  month={index}
                  year={currentYear}
                />
              )}
              <span style={cellColor ? { color: cellColor } : undefined}>
                {formatCurrency(value || 0)}
              </span>
            </div>
          </MonthCell>
        );
      })}
      <AnnualCell className={`text-gray-800 dark:text-gray-100 ${GRID.rowBg}`}>
        {formatCurrency(itemAnnualTotal)}
      </AnnualCell>
    </TableRow>
  );
};

// Memo: a planilha re-renderiza por estados globais (modo comentário, queries
// de proventos/evolução chegando); linhas com props estáveis são puladas.
export const ItemRow = React.memo(ItemRowComponent);
