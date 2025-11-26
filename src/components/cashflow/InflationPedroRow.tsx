import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/utils/formatters";

interface InflationPedroRowProps {
  despesasByMonth: number[];
  despesasAnnual: number;
  showActionsColumn?: boolean;
}

export const InflationPedroRow: React.FC<InflationPedroRowProps> = ({ 
  despesasByMonth,
  despesasAnnual,
  showActionsColumn = false 
}) => {
  // Calcular inflação Pedro por mês
  // Inflação Pedro = ((Despesas mês atual / Despesas mês anterior) - 1) * 100
  const calculateInflation = (currentMonthValue: number, previousMonthValue: number, monthIndex: number): number | null => {
    // Janeiro sempre retorna 0%
    if (monthIndex === 0) return 0;
    
    // Se não há despesas no mês anterior, não é possível calcular
    if (previousMonthValue === 0) return null;
    
    // Calcular percentual de variação
    return ((currentMonthValue / previousMonthValue) - 1) * 100;
  };

  // Calcular inflação anual (comparando total anual com zero não faz sentido, então será null)
  // Ou podemos calcular a média, mas vou deixar como null por enquanto
  const annualInflation: number | null = null;

  return (
    <TableRow className="h-6 bg-[#D9D9D9]" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell className="px-2 font-bold text-black border-t border-b border-l border-black dark:border-black text-xs w-32 text-left h-6 leading-6">
        Inflação Pedro
      </TableCell>
      <TableCell className="px-2 font-bold text-black border-t border-b border-black dark:border-black text-xs w-40 h-6 leading-6">
        -
      </TableCell>
      <TableCell className="px-2 font-bold text-black border-t border-b border-black dark:border-black text-xs w-16 text-center h-6 leading-6">
        -
      </TableCell>
      <TableCell className="px-2 font-bold text-black border-t border-b border-r border-black dark:border-black text-xs w-16 text-right h-6 leading-6">
        -
      </TableCell>
      {despesasByMonth.map((despesasAtual, index) => {
        const despesasAnterior = index === 0 ? 0 : despesasByMonth[index - 1];
        const inflation = calculateInflation(despesasAtual, despesasAnterior, index);
        
        return (
          <TableCell 
            key={index} 
            className={`px-1 font-bold border border-black dark:border-black text-xs w-12 text-right h-6 leading-6 ${
              inflation === null 
                ? 'text-gray-500 dark:text-gray-400' 
                : inflation < 0 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
            }`}
          >
            {inflation === null ? '-' : formatPercent(inflation)}
          </TableCell>
        );
      })}
      <TableCell 
        className={`px-2 font-bold border border-black dark:border-black text-xs w-16 text-right h-6 leading-6 ${
          annualInflation === null 
            ? 'text-gray-500 dark:text-gray-400' 
            : annualInflation < 0 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-red-600 dark:text-red-400'
        }`}
      >
        {annualInflation === null ? '-' : formatPercent(annualInflation)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-black dark:border-black w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};

