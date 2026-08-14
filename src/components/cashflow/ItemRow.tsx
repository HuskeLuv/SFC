import React from 'react';
import Link from 'next/link';
import { TableCell, TableRow } from '@/components/ui/table';
import { CashflowItem, CashflowGroup } from '@/types/cashflow';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { FIXED_COLUMN_BODY_STYLES } from './fixedColumns';
import { CommentIndicator } from './CommentIndicator';

interface ItemRowProps {
  item: CashflowItem;
  itemTotals: number[];
  itemAnnualTotal: number;
  itemPercentage: number;
  group: CashflowGroup;
  onItemUpdate?: (updatedItem: CashflowItem) => void;
  startEditing: (itemId: string, field: string, monthIndex?: number) => void;
  stopEditing: () => void;
  isEditing: (itemId: string, field: string, monthIndex?: number) => boolean;
  currentYear?: number;
  isLastItem?: boolean;
  /** Reordena a linha dentro do grupo (setinhas ↑↓ no hover). */
  onMoveItem?: (item: CashflowItem, group: CashflowGroup, direction: 'up' | 'down') => void;
}

const ItemRowComponent: React.FC<ItemRowProps> = ({
  item,
  itemTotals,
  itemAnnualTotal,
  itemPercentage,
  group,
  currentYear = new Date().getFullYear(),
  onMoveItem,
}) => {
  const getPercentageColorClass = () => {
    return 'text-black dark:text-gray-300';
  };

  // Índice único por mês (evita 12 finds por linha a cada render).
  const valuesByMonth: Record<number, NonNullable<CashflowItem['values']>[number]> = {};
  for (const v of item.values ?? []) {
    if (v.year === currentYear) valuesByMonth[v.month] = v;
  }

  return (
    <TableRow
      className="group/linha h-6 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-white dark:bg-gray-900"
      style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}
    >
      <TableCell
        className="px-2 font-medium text-gray-800 dark:text-white text-xs text-left h-6 leading-6 whitespace-nowrap bg-white dark:bg-gray-900"
        style={{
          position: 'sticky',
          ...FIXED_COLUMN_BODY_STYLES[0],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none',
        }}
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
      </TableCell>
      <TableCell
        className="px-2 font-normal text-gray-800 text-xs dark:text-gray-400 h-6 leading-6 whitespace-nowrap bg-white dark:bg-gray-900"
        style={{
          position: 'sticky',
          ...FIXED_COLUMN_BODY_STYLES[1],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        <span className="cursor-default truncate block" title={item.significado || undefined}>
          {item.significado || '-'}
        </span>
      </TableCell>
      <TableCell
        className="px-2 font-normal text-gray-800 text-xs dark:text-gray-400 text-center h-6 leading-6 whitespace-nowrap bg-white dark:bg-gray-900"
        style={{
          position: 'sticky',
          ...FIXED_COLUMN_BODY_STYLES[2],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        <span className="cursor-default">
          {group.type === 'investimento' ? '-' : item.rank || '-'}
        </span>
      </TableCell>
      <TableCell
        className={`px-2 font-normal text-xs text-right h-6 leading-6 whitespace-nowrap bg-white dark:bg-gray-900 ${getPercentageColorClass()}`}
        style={{
          position: 'sticky',
          ...FIXED_COLUMN_BODY_STYLES[3],
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        {group.type === 'investimento' || group.type === 'saldo'
          ? '-'
          : itemPercentage > 0
            ? formatPercent(itemPercentage)
            : '-'}
      </TableCell>
      {itemTotals.map((value, index) => {
        // Obter cor do valor mensal se existir
        // Buscar em item.values que pode vir do banco
        // IMPORTANTE: Buscar por month (0-11) que corresponde ao índice
        const monthlyValue = valuesByMonth[index];
        // Aporte/Resgate (grupo investimento, automático da carteira):
        // aporte em verde, resgate em vermelho (regra Pedro Haddad).
        const signColor =
          group.type === 'investimento' && value ? (value > 0 ? '#16a34a' : '#dc2626') : null;
        const cellColor = monthlyValue?.color || signColor;
        const cellComment = monthlyValue?.comment || null;

        return (
          <TableCell
            key={index}
            className="px-1 font-normal text-gray-800 text-xs dark:text-gray-400 text-right cursor-default h-6 leading-6 bg-[#F2F2F2] dark:bg-gray-800 border-t border-b border-l border-r border-white dark:border-gray-900"
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
          </TableCell>
        );
      })}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-gray-900"></TableCell>
      <TableCell
        className="px-2 font-semibold text-gray-800 text-xs dark:text-white text-right h-6 leading-6 bg-[#F2F2F2] dark:bg-gray-800 border-t border-b border-l border-r border-white dark:border-gray-900"
        style={{ minWidth: '4rem' }}
      >
        {formatCurrency(itemAnnualTotal)}
      </TableCell>
    </TableRow>
  );
};

// Memo: a planilha re-renderiza por estados globais (modo comentário, queries
// de proventos/evolução chegando); linhas com props estáveis são puladas.
export const ItemRow = React.memo(ItemRowComponent);
