import React from 'react';
import Link from 'next/link';
import { TableRow } from '@/components/ui/table';
import { CashflowItem, CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { CommentIndicator } from './CommentIndicator';
import { FixedCell, MonthCell, AnnualCell, SpacerCell } from './GridCells';
import { GRID } from './cashflowGridStyles';

interface ItemRowProps {
  item: CashflowItem;
  itemTotals: number[];
  itemAnnualTotal: number;
  itemPercentage: number;
  group: CashflowGroup;
  currentYear?: number;
  /** Reordena a linha dentro do grupo (setinhas ↑↓ no hover). */
  onMoveItem?: (item: CashflowItem, group: CashflowGroup, direction: 'up' | 'down') => void;
}

const ROW_BG = 'bg-white dark:bg-gray-900';

const ItemRowComponent: React.FC<ItemRowProps> = ({
  item,
  itemTotals,
  itemAnnualTotal,
  itemPercentage,
  group,
  currentYear = new Date().getFullYear(),
  onMoveItem,
}) => {
  // Índice único por mês (evita 12 finds por linha a cada render).
  const valuesByMonth: Record<number, NonNullable<CashflowItem['values']>[number]> = {};
  for (const v of item.values ?? []) {
    if (v.year === currentYear) valuesByMonth[v.month] = v;
  }

  const isDerived = group.type === 'investimento' || group.type === 'saldo';

  return (
    <TableRow
      className={`group/linha ${GRID.row} hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${ROW_BG}`}
      style={GRID.rowStyle}
    >
      <FixedCell
        col={0}
        className={`font-medium text-gray-800 dark:text-white text-left ${ROW_BG}`}
      >
        <span className="cursor-default truncate block" title={item.name || undefined}>
          {onMoveItem ? (
            // Setinhas de reordenação — aparecem no hover da linha; nas
            // bordas do grupo o movimento é no-op (handler valida).
            <span className="mr-1 inline-flex gap-0.5 align-middle opacity-0 transition-opacity group-hover/linha:opacity-100">
              <button
                type="button"
                aria-label={`Mover ${item.name} para cima`}
                title="Mover para cima"
                onClick={() => onMoveItem(item, group, 'up')}
                className="rounded px-0.5 text-[9px] leading-none text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`Mover ${item.name} para baixo`}
                title="Mover para baixo"
                onClick={() => onMoveItem(item, group, 'down')}
                className="rounded px-0.5 text-[9px] leading-none text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                ▼
              </button>
            </span>
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
      <FixedCell col={1} className={`font-normal text-gray-800 dark:text-gray-400 ${ROW_BG}`}>
        <span className="cursor-default truncate block" title={item.significado || undefined}>
          {item.significado || '-'}
        </span>
      </FixedCell>
      <FixedCell
        col={2}
        className={`font-normal text-gray-800 dark:text-gray-400 text-center ${ROW_BG}`}
      >
        <span className="cursor-default">
          {group.type === 'investimento' ? '-' : item.rank || '-'}
        </span>
      </FixedCell>
      <FixedCell
        col={3}
        className={`font-normal text-black dark:text-gray-300 text-right ${ROW_BG}`}
      >
        {isDerived ? '-' : itemPercentage > 0 ? formatPercent(itemPercentage) : '-'}
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
            className={`${GRID.dataText} cursor-default`}
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
      <SpacerCell />
      <AnnualCell className={GRID.annualText}>{formatCurrency(itemAnnualTotal)}</AnnualCell>
    </TableRow>
  );
};

// Memo: a planilha re-renderiza por estados globais (modo comentário, queries
// de proventos/evolução chegando); linhas com props estáveis são puladas.
export const ItemRow = React.memo(ItemRowComponent);
