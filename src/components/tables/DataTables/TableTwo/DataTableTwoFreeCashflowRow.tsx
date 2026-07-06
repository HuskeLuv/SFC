'use client';
import React from 'react';
import { SummaryRow } from '@/components/cashflow/SummaryRow';

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
    fluxoCaixaLivreAcumulado.push(saldoMesAtual - aportesResgates + saldoNaoInvestidoMesAnterior);
  }

  return (
    <SummaryRow
      label="Fluxo de Caixa livre"
      cells={fluxoCaixaLivreAcumulado}
      annual={fluxoCaixaLivreAcumulado[11] || 0}
      showActionsColumn={showActionsColumn}
    />
  );
}
