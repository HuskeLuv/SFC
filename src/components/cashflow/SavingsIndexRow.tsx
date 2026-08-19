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
  // Ticket 19/08/2026: fundo cinza-claro da planilha (RGB 204,204,204),
  // rótulo preto e números na convenção Excel — positivo azul, negativo
  // vermelho (substitui a escala em 4 faixas de ago/2026, ilegível no
  // fundo claro).
  <SummaryRow
    label="Índice de Poupança Mensal"
    cells={totalByMonth.map((saldo, index) => savingsIndex(saldo, entradasByMonth[index] || 0))}
    annual={savingsIndex(totalAnnual, entradasAnnual)}
    format="percent"
    variant="silver"
    negativeRed
    positiveBlue
    showActionsColumn={showActionsColumn}
  />
);
