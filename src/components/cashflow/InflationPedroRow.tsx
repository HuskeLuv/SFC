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

  // Calcular inflação por mês
  const monthlyInflations = despesasByMonth.map((despesasAtual, index) => {
    const despesasAnterior = index === 0 ? 0 : despesasByMonth[index - 1];
    return calculateInflation(despesasAtual, despesasAnterior, index);
  });

  // Calcular média dos valores mensais (ignorando nulls)
  const validInflations = monthlyInflations.filter((inf): inf is number => inf !== null);
  const annualInflation: number | null = validInflations.length > 0 
    ? validInflations.reduce((sum, inf) => sum + inf, 0) / validInflations.length 
    : null;

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
        const inflation = monthlyInflations[index];
        
        return (
          <TableCell 
            key={index} 
            className="px-1 font-bold text-black border border-black dark:border-black text-xs w-12 text-right h-6 leading-6"
          >
            {inflation === null ? '-' : formatPercent(inflation)}
          </TableCell>
        );
      })}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
      <TableCell 
        className="px-2 font-bold text-black border border-black dark:border-black text-xs w-16 text-right h-6 leading-6"
      >
        {annualInflation === null ? '-' : formatPercent(annualInflation)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-black dark:border-black w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};

