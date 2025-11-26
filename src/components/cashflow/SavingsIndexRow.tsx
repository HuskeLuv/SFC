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
    <TableRow className="h-6 bg-[#998256] text-white w-full" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell className="px-2 font-bold text-white border-t border-b border-l border-black dark:border-black text-xs w-32 text-left h-6 leading-6">
        Índice de Poupança Mensal
      </TableCell>
      <TableCell className="px-2 font-bold text-white border-t border-b border-black dark:border-black text-xs w-40 h-6 leading-6">
        -
      </TableCell>
      <TableCell className="px-2 font-bold text-white border-t border-b border-black dark:border-black text-xs w-16 text-center h-6 leading-6">
        -
      </TableCell>
      <TableCell className="px-2 font-bold text-white border-t border-b border-r border-black dark:border-black text-xs w-16 text-right h-6 leading-6">
        -
      </TableCell>
      {totalByMonth.map((saldo, index) => {
        const entradas = entradasByMonth[index] || 0;
        const savingsIndex = calculateSavingsIndex(saldo, entradas);
        
        return (
          <TableCell 
            key={index} 
            className="px-1 font-bold text-white border border-black dark:border-black text-xs w-12 text-right h-6 leading-6"
          >
            {savingsIndex === null ? '-' : formatPercent(savingsIndex)}
          </TableCell>
        );
      })}
      <TableCell className="px-2 font-bold text-white border border-black dark:border-black text-xs w-16 text-right h-6 leading-6">
        {annualSavingsIndex === null ? '-' : formatPercent(annualSavingsIndex)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-black dark:border-black w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};

