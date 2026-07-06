import React from 'react';
import { SummaryRow } from './SummaryRow';

interface PreviousMonthBalanceRowProps {
  valuesByMonth: number[];
  totalAnnual?: number;
  showActionsColumn?: boolean;
}

export const PreviousMonthBalanceRow: React.FC<PreviousMonthBalanceRowProps> = ({
  valuesByMonth,
  showActionsColumn = false,
}) => (
  <SummaryRow
    label="Saldo Não Investido no Mês Anterior"
    cells={valuesByMonth.map((v) => v || 0)}
    annual={valuesByMonth.reduce((sum, val) => sum + val, 0)}
    showActionsColumn={showActionsColumn}
  />
);
