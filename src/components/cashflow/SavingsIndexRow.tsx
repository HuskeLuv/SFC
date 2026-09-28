import React from 'react';
import { SummaryRow } from './SummaryRow';
import { savingsIndex } from '@/services/cashflow/derivedIndices';

interface SavingsIndexRowProps {
  totalByMonth: number[];
  entradasByMonth: number[];
  totalAnnual: number;
  entradasAnnual: number;
}

export const SavingsIndexRow: React.FC<SavingsIndexRowProps> = ({
  totalByMonth,
  entradasByMonth,
  totalAnnual,
  entradasAnnual,
}) => (
  // Ticket 19/08/2026: números na convenção Excel — positivo azul, negativo
  // vermelho (substitui a escala em 4 faixas de ago/2026, ilegível no fundo
  // claro). Fundo: linha de total padrão do app (padronização 09/2026).
  <SummaryRow
    label="Índice de Poupança Mensal"
    cells={totalByMonth.map((saldo, index) => savingsIndex(saldo, entradasByMonth[index] || 0))}
    annual={savingsIndex(totalAnnual, entradasAnnual)}
    format="percent"
    variant="total"
    negativeRed
    positiveBlue
  />
);
