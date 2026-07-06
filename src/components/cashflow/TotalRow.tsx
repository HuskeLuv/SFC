import React from 'react';
import { SummaryRow } from './SummaryRow';

interface TotalRowProps {
  totalByMonth: number[];
  totalAnnual: number;
  showActionsColumn?: boolean;
}

export const TotalRow: React.FC<TotalRowProps> = ({
  totalByMonth,
  totalAnnual,
  showActionsColumn = false,
}) => (
  <SummaryRow
    label="Saldo do mês (Lucro Líquido)"
    cells={totalByMonth.map((v) => v || 0)}
    annual={totalAnnual}
    negativeRed
    showActionsColumn={showActionsColumn}
  />
);
