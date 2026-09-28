import React from 'react';
import { SummaryRow } from './SummaryRow';
import { inflacaoPessoalAnual, inflacaoPessoalPorMes } from '@/services/cashflow/derivedIndices';

interface InflationPedroRowProps {
  despesasByMonth: number[];
  despesasAnnual?: number;
}

export const InflationPedroRow: React.FC<InflationPedroRowProps> = ({ despesasByMonth }) => {
  // Inflação pessoal mês a mês e média do ano (conta em services/cashflow/derivedIndices).
  const monthlyInflations = inflacaoPessoalPorMes(despesasByMonth);
  const annualInflation = inflacaoPessoalAnual(monthlyInflations);

  return (
    <SummaryRow
      label="Inflação Pedro"
      cells={monthlyInflations}
      annual={annualInflation}
      format="percent"
      variant="total"
    />
  );
};
