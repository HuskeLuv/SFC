import React from 'react';
import { SummaryRow } from './SummaryRow';

interface SavingsIndexRowProps {
  totalByMonth: number[];
  entradasByMonth: number[];
  totalAnnual: number;
  entradasAnnual: number;
  showActionsColumn?: boolean;
}

// Índice de poupança = (saldo do mês / entradas do mês) * 100
const savingsIndex = (saldo: number, entradas: number): number | null =>
  entradas === 0 ? null : (saldo / entradas) * 100;

export const SavingsIndexRow: React.FC<SavingsIndexRowProps> = ({
  totalByMonth,
  entradasByMonth,
  totalAnnual,
  entradasAnnual,
  showActionsColumn = false,
}) => (
  <SummaryRow
    label="Índice de Poupança Mensal"
    cells={totalByMonth.map((saldo, index) => savingsIndex(saldo, entradasByMonth[index] || 0))}
    annual={savingsIndex(totalAnnual, entradasAnnual)}
    format="percent"
    showActionsColumn={showActionsColumn}
  />
);
