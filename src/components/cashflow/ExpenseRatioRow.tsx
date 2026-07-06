import React from 'react';
import { SummaryRow } from './SummaryRow';

interface ExpenseRatioRowProps {
  despesasByMonth: number[];
  entradasByMonth: number[];
  despesasAnnual: number;
  entradasAnnual: number;
  showActionsColumn?: boolean;
}

// % Despesas sobre Entradas = (despesas fixas + variáveis) / total de entradas.
// Complemento do índice de poupança: os dois somam 100% do que entra.
const expenseRatio = (despesas: number, entradas: number): number | null =>
  entradas === 0 ? null : (despesas / entradas) * 100;

export const ExpenseRatioRow: React.FC<ExpenseRatioRowProps> = ({
  despesasByMonth,
  entradasByMonth,
  despesasAnnual,
  entradasAnnual,
  showActionsColumn = false,
}) => (
  <SummaryRow
    label="% Despesas sobre Entradas"
    cells={despesasByMonth.map((despesas, index) =>
      expenseRatio(despesas, entradasByMonth[index] || 0),
    )}
    annual={expenseRatio(despesasAnnual, entradasAnnual)}
    format="percent"
    showActionsColumn={showActionsColumn}
  />
);
