import React from 'react';
import { TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { MONTHS } from '@/constants/cashflow';
import { FixedCell, AnnualCell } from './GridCells';
import { GRID } from './cashflowGridStyles';

interface TableHeaderComponentProps {
  /** Índice do mês atual (−1 quando a planilha não é do ano corrente). */
  currentMonth?: number;
}

// Cabeçalho inteiro é sticky no topo (as colunas fixas somam sticky-left/right).
const STICKY_TOP = { position: 'sticky' as const, top: 0, zIndex: 400 };

const FIXED_HEADERS: { label: string; align: string; quebra?: boolean }[] = [
  { label: 'Itens', align: 'text-left' },
  { label: 'O seu porquê', align: 'text-left' },
  // "Nível Prioridade" quebra em 2 linhas (planilha-base) — a coluna tem 80px.
  { label: 'Nível Prioridade', align: 'text-center', quebra: true },
  { label: '% Receita', align: 'text-right' },
];

export const TableHeaderComponent: React.FC<TableHeaderComponentProps> = ({
  currentMonth = -1,
}) => (
  <TableHeader style={{ ...STICKY_TOP, isolation: 'isolate' }}>
    <TableRow className={`${GRID.row} ${GRID.head}`} style={GRID.headStyle}>
      {FIXED_HEADERS.map(({ label, align, quebra }, index) => (
        <FixedCell
          key={label}
          col={index as 0 | 1 | 2 | 3}
          isHeader
          className={`${align} ${GRID.head} border-b-0`}
          style={GRID.headStyle}
        >
          {quebra ? (
            <span className="block text-[9px] leading-[10px] whitespace-normal">{label}</span>
          ) : (
            label
          )}
        </FixedCell>
      ))}
      {MONTHS.map((month, index) => (
        <TableCell
          key={month}
          isHeader
          id={index === 0 ? 'first-month-cell' : undefined}
          className={`${GRID.month} ${GRID.cell} ${GRID.head} border-b-0 text-center whitespace-nowrap`}
          style={{
            ...STICKY_TOP,
            ...GRID.monthStyle,
            ...(index === currentMonth ? GRID.currentMonthHeader : {}),
          }}
          title={index === currentMonth ? 'Mês atual' : undefined}
        >
          {month}
        </TableCell>
      ))}
      <AnnualCell isHeader className={`${GRID.head} border-b-0`} style={GRID.headStyle}>
        Total Anual
      </AnnualCell>
    </TableRow>
  </TableHeader>
);
