import React from 'react';
import { SummaryRow } from './SummaryRow';

interface FinancialPeaceIndexRowProps {
  proventosByMonth: number[];
  despesasFixasByMonth: number[];
  proventosAnnual: number;
  despesasFixasAnnual: number;
  showActionsColumn?: boolean;
}

// Índice paz financeira = (proventos recebidos / despesas FIXAS) * 100.
// Denominador exclui despesas variáveis por definição.
const peaceIndex = (proventos: number, despesasFixas: number): number | null =>
  despesasFixas === 0 ? null : (proventos / despesasFixas) * 100;

export const FinancialPeaceIndexRow: React.FC<FinancialPeaceIndexRowProps> = ({
  proventosByMonth,
  despesasFixasByMonth,
  proventosAnnual,
  despesasFixasAnnual,
  showActionsColumn = false,
}) => (
  <SummaryRow
    label="Índice paz financeira"
    cells={proventosByMonth.map((proventos, index) =>
      peaceIndex(proventos, despesasFixasByMonth[index] || 0),
    )}
    annual={peaceIndex(proventosAnnual, despesasFixasAnnual)}
    format="percent"
    variant="gold"
    showActionsColumn={showActionsColumn}
  />
);
