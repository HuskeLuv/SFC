import React from 'react';
import { SummaryRow } from './SummaryRow';

interface EvolutionRowProps {
  valuesByMonth: number[];
  totalAnnual: number;
  showActionsColumn?: boolean;
}

export const EvolutionRow: React.FC<EvolutionRowProps> = ({
  valuesByMonth,
  totalAnnual,
  showActionsColumn = false,
}) => (
  <SummaryRow
    label="Evolução do Patrimônio"
    cells={valuesByMonth.map((v) => v || 0)}
    annual={totalAnnual}
    negativeRed
    showActionsColumn={showActionsColumn}
  />
);
