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

/**
 * Escala de cor do índice (pedido ago/2026): azul ≥ 20%, amarelo 10–20%,
 * vermelho claro 0–10%, vermelho forte quando negativo. Função de módulo
 * (referência estável) — SummaryRow é memoizada.
 */
const savingsIndexClass = (value: number | null): string | null => {
  if (value === null) return null;
  if (value < 0) return 'text-red-700 dark:text-red-500';
  if (value < 10) return 'text-red-300 dark:text-red-300';
  if (value < 20) return 'text-yellow-300 dark:text-yellow-300';
  return 'text-blue-600 dark:text-blue-300';
};

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
    variant="khaki"
    cellClass={savingsIndexClass}
    showActionsColumn={showActionsColumn}
  />
);
