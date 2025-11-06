import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/utils/formatters";

interface SavingsIndexRowProps {
  totalByMonth: number[];
  entradasByMonth: number[];
  totalAnnual: number;
  entradasAnnual: number;
  showActionsColumn?: boolean;
}

export const SavingsIndexRow: React.FC<SavingsIndexRowProps> = ({ 
  totalByMonth, 
  entradasByMonth,
  totalAnnual,
  entradasAnnual,
  showActionsColumn = false 
}) => {
  // Calcular índice de poupança por mês
  const calculateSavingsIndex = (saldo: number, entradas: number): number | null => {
    if (entradas === 0) return null;
    return (saldo / entradas) * 100;
  };

  // Calcular índice anual
  const annualSavingsIndex = calculateSavingsIndex(totalAnnual, entradasAnnual);

  return (
    <TableRow className="bg-gray-100 dark:bg-gray-800">
      <TableCell className="px-2 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-xs w-32">
        Índice de Poupança
      </TableCell>
      <TableCell className="px-2 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-40">
        -
      </TableCell>
      <TableCell className="px-2 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-center">
        -
      </TableCell>
      <TableCell className="px-2 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
        -
      </TableCell>
      {totalByMonth.map((saldo, index) => {
        const entradas = entradasByMonth[index] || 0;
        const savingsIndex = calculateSavingsIndex(saldo, entradas);
        
        return (
          <TableCell 
            key={index} 
            className={`px-1 py-2 font-bold border border-gray-100 dark:border-white/[0.05] text-xs w-12 text-right ${
              savingsIndex === null 
                ? 'text-gray-500 dark:text-gray-400' 
                : savingsIndex >= 0 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
            }`}
          >
            {savingsIndex === null ? '-' : formatPercent(savingsIndex)}
          </TableCell>
        );
      })}
      <TableCell 
        className={`px-2 py-2 font-bold border border-gray-100 dark:border-white/[0.05] text-xs w-16 text-right ${
          annualSavingsIndex === null 
            ? 'text-gray-500 dark:text-gray-400' 
            : annualSavingsIndex >= 0 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-red-600 dark:text-red-400'
        }`}
      >
        {annualSavingsIndex === null ? '-' : formatPercent(annualSavingsIndex)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-8"></TableCell>
      )}
    </TableRow>
  );
};

