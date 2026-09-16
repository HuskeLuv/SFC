import React from 'react';
import { TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { MONTHS } from '@/constants/cashflow';
import { FixedCell } from './GridCells';
import { GRID } from './cashflowGridStyles';

interface TableHeaderComponentProps {
  showActionsColumn?: boolean;
}

const HEAD_BG = 'bg-white dark:bg-gray-900';
const HEAD_TH = `${HEAD_BG} text-center whitespace-nowrap ${GRID.cell}`;
const HEAD_LABEL = 'font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap';
// Cabeçalho inteiro é sticky no topo (as 4 colunas fixas somam sticky-left via FixedCell).
const STICKY_TOP = { position: 'sticky' as const, top: 0, zIndex: 400 };

const FIXED_HEADERS: { label: string; azul?: boolean; quebra?: boolean }[] = [
  { label: 'Itens' },
  // "O SEU PORQUÊ" e "Nível Prioridade" em azul negrito (planilha-base
  // Escolhi $er Rico, pedido ago/2026); a segunda quebra em 2 linhas como no
  // Excel — a coluna tem 80px.
  { label: 'O SEU PORQUÊ', azul: true },
  { label: 'Nível Prioridade', azul: true, quebra: true },
  { label: '% Receita' },
];

export const TableHeaderComponent: React.FC<TableHeaderComponentProps> = ({
  showActionsColumn = false,
}) => (
  <TableHeader className={HEAD_BG} style={{ ...STICKY_TOP, isolation: 'isolate' }}>
    <TableRow className={`${GRID.row} ${HEAD_BG}`} style={GRID.rowStyle}>
      {FIXED_HEADERS.map(({ label, azul, quebra }, index) => (
        <FixedCell
          key={label}
          col={index as 0 | 1 | 2 | 3}
          frame="framed"
          isHeader
          className={HEAD_TH}
        >
          <p
            className={`font-bold ${
              azul ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-400'
            } ${
              quebra ? 'text-[10px] leading-[11px] whitespace-normal' : 'text-xs whitespace-nowrap'
            }`}
          >
            {label}
          </p>
        </FixedCell>
      ))}
      {MONTHS.map((month, index) => (
        <TableCell
          key={month}
          isHeader
          id={index === 0 ? 'first-month-cell' : undefined}
          className={`px-1 border-t border-b border-gray-200 border-r border-gray-200 ${HEAD_TH} ${
            index === 0 ? GRID.boldMonthFirst : GRID.boldMonthOther
          }`}
          style={{ ...STICKY_TOP, ...GRID.monthStyle }}
        >
          <p className={HEAD_LABEL}>{month}</p>
        </TableCell>
      ))}
      {/* Coluna vazia de espaçamento: o div absoluto cobre a emenda entre Dez e Total Anual */}
      <TableCell
        isHeader
        className={`px-0 w-[10px] ${GRID.cell} ${HEAD_BG} border-0 p-0 relative`}
        style={{ border: 'none', padding: 0, position: 'relative', overflow: 'visible' }}
      >
        <div
          className={HEAD_BG}
          style={{
            position: 'absolute',
            top: '-3px',
            left: '1px',
            right: 0,
            bottom: '-3px',
            zIndex: 35,
          }}
        />
      </TableCell>
      <TableCell
        isHeader
        className={`px-2 border-t border-b border-gray-200 border border-gray-200 ${HEAD_TH}`}
        style={{ ...STICKY_TOP, ...GRID.annualStyle }}
      >
        <p className={HEAD_LABEL}>Total Anual</p>
      </TableCell>
      {showActionsColumn && (
        <TableCell
          isHeader
          className={`px-2 border-t border-b border-gray-200 border border-gray-200 ${HEAD_TH}`}
          style={{ ...STICKY_TOP, minWidth: '2rem' }}
        >
          <p className={HEAD_LABEL}>Ações</p>
        </TableCell>
      )}
    </TableRow>
  </TableHeader>
);
