import React from 'react';
import { SummaryRow } from './SummaryRow';

interface TotalRowProps {
  totalByMonth: number[];
  totalAnnual: number;
}

export const TotalRow: React.FC<TotalRowProps> = ({ totalByMonth, totalAnnual }) => (
  <SummaryRow
    label="Saldo do mês (Lucro Líquido)"
    cells={totalByMonth.map((v) => v || 0)}
    annual={totalAnnual}
    variant="highlight"
    negativeRed
    positiveBlue
  />
);
