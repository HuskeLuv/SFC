'use client';
import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { FIXED_COLUMN_BODY_STYLES } from '@/components/cashflow/fixedColumns';

interface DataTableTwoFreeCashflowRowProps {
  entradasByMonthWithProventos: number[];
  despesasByMonth: number[];
  investimentosByMonth: number[];
  showActionsColumn: boolean;
}

export default function DataTableTwoFreeCashflowRow({
  entradasByMonthWithProventos,
  despesasByMonth,
  investimentosByMonth,
  showActionsColumn,
}: DataTableTwoFreeCashflowRowProps) {
  const fluxoCaixaLivreAcumulado: number[] = [];
  for (let index = 0; index < 12; index++) {
    const saldoMesAtual = entradasByMonthWithProventos[index] - despesasByMonth[index];
    const aportesResgates = investimentosByMonth[index] || 0;
    const saldoNaoInvestidoMesAnterior = index === 0 ? 0 : fluxoCaixaLivreAcumulado[index - 1] || 0;
    const fluxoCaixaLivre = saldoMesAtual - aportesResgates + saldoNaoInvestidoMesAnterior;
    fluxoCaixaLivreAcumulado.push(fluxoCaixaLivre);
  }

  const totalAnual = fluxoCaixaLivreAcumulado[11] || 0;

  return (
    <TableRow
      className="h-6"
      style={{
        fontFamily: 'Calibri, sans-serif',
        fontSize: '12px',
        backgroundColor: '#998256',
      }}
    >
      <TableCell
        className="px-2 font-bold text-white text-xs text-left h-6 leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0"
        style={{
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[0],
          overflow: 'hidden',
          flexShrink: 0,
          borderRight: 'none',
        }}
      >
        Fluxo de Caixa livre
      </TableCell>
      <TableCell
        className="px-2 font-bold text-white text-xs h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[1],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        -
      </TableCell>
      <TableCell
        className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[2],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        -
      </TableCell>
      <TableCell
        className="px-2 font-bold text-white text-xs text-right h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r border-gray-300"
        style={{
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[3],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
        }}
      >
        -
      </TableCell>
      {fluxoCaixaLivreAcumulado.map((valor, index) => (
        <TableCell
          key={index}
          className={`px-1 font-bold text-white border-t border-b border-gray-200 border-r border-gray-200 text-xs text-right h-6 leading-6 ${
            index === 0 ? 'border-l-0' : 'border-l border-gray-200'
          }`}
          style={{ minWidth: '3rem' }}
        >
          {formatCurrency(valor || 0)}
        </TableCell>
      ))}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
      <TableCell
        className="px-2 font-bold text-white border border-gray-200 text-xs text-right h-6 leading-6"
        style={{ minWidth: '4rem' }}
      >
        {formatCurrency(totalAnual)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
}
