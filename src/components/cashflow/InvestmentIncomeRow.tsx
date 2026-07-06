import React from 'react';
import { SummaryRow } from './SummaryRow';

interface InvestmentIncomeRowProps {
  valuesByMonth: number[];
  totalAnnual: number;
  showActionsColumn?: boolean;
}

export const InvestmentIncomeRow: React.FC<InvestmentIncomeRowProps> = ({
  valuesByMonth,
  totalAnnual,
  showActionsColumn = false,
}) => {
  const calculatedTotal = valuesByMonth.reduce((sum, value) => sum + value, 0);
  const annualTotal = Number.isFinite(totalAnnual) ? totalAnnual : calculatedTotal;

  return (
    <SummaryRow
      label="Rendimentos Recebidos"
      cells={valuesByMonth.map((v) => v || 0)}
      annual={annualTotal}
      showActionsColumn={showActionsColumn}
    />
  );
};
