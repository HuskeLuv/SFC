import React from 'react';
import { SummaryRow } from './SummaryRow';
import { peaceIndex } from '@/services/cashflow/derivedIndices';

interface FinancialPeaceIndexRowProps {
  proventosByMonth: number[];
  despesasFixasByMonth: number[];
  proventosAnnual: number;
  despesasFixasAnnual: number;
}

export const FinancialPeaceIndexRow: React.FC<FinancialPeaceIndexRowProps> = ({
  proventosByMonth,
  despesasFixasByMonth,
  proventosAnnual,
  despesasFixasAnnual,
}) => (
  <SummaryRow
    label="Índice paz financeira"
    cells={proventosByMonth.map((proventos, index) =>
      peaceIndex(proventos, despesasFixasByMonth[index] || 0),
    )}
    annual={peaceIndex(proventosAnnual, despesasFixasAnnual)}
    format="percent"
    variant="total"
  />
);
