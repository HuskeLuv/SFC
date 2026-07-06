import React from 'react';
import { SummaryRow } from './SummaryRow';

interface InflationPedroRowProps {
  despesasByMonth: number[];
  despesasAnnual?: number;
  showActionsColumn?: boolean;
}

export const InflationPedroRow: React.FC<InflationPedroRowProps> = ({
  despesasByMonth,
  showActionsColumn = false,
}) => {
  // Inflação pessoal = ((despesas mês atual / despesas mês anterior) - 1) * 100.
  // Janeiro é sempre 0%; mês anterior zerado não permite cálculo.
  const monthlyInflations = despesasByMonth.map((despesasAtual, index) => {
    if (index === 0) return 0;
    const despesasAnterior = despesasByMonth[index - 1];
    if (despesasAnterior === 0) return null;
    return (despesasAtual / despesasAnterior - 1) * 100;
  });

  const validInflations = monthlyInflations.filter((inf): inf is number => inf !== null);
  const annualInflation =
    validInflations.length > 0
      ? validInflations.reduce((sum, inf) => sum + inf, 0) / validInflations.length
      : null;

  return (
    <SummaryRow
      label="Inflação Pedro"
      cells={monthlyInflations}
      annual={annualInflation}
      format="percent"
      variant="gray"
      showActionsColumn={showActionsColumn}
    />
  );
};
