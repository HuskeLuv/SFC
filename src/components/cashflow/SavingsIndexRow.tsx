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
      <TableCell 
        className="px-2 font-bold text-white border-t border-b border-l border-black dark:border-black text-xs w-32 text-left h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          left: 0,
          zIndex: 50,
          backgroundColor: '#998256',
          minWidth: '128px',
          maxWidth: '128px',
          width: '128px',
          boxShadow: '1px 0 0 0 rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}
      >
        Índice de Poupança Mensal
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white border-t border-b border-black dark:border-black text-xs w-40 h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          left: '128px',
          zIndex: 51,
          backgroundColor: '#998256',
          boxShadow: '2px 0 0 0 black',
          minWidth: '160px',
          maxWidth: '160px',
          width: '160px',
          overflow: 'hidden'
        }}
      >
        -
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white border-t border-b border-black dark:border-black text-xs w-16 text-center h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          left: '288px',
          zIndex: 52,
          backgroundColor: '#998256',
          boxShadow: '2px 0 0 0 black',
          minWidth: '64px',
          maxWidth: '64px',
          width: '64px',
          overflow: 'hidden'
        }}
      >
        -
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white border-t border-b border-r border-black dark:border-black text-xs w-16 text-right h-6 leading-6 whitespace-nowrap"
        style={{ 
          position: 'sticky',
          left: '352px',
          zIndex: 53,
          backgroundColor: '#998256',
          boxShadow: '2px 0 0 0 black',
          minWidth: '64px',
          maxWidth: '64px',
          width: '64px',
          overflow: 'hidden'
        }}
      >
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
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
      <TableCell className="px-2 font-bold text-white border border-black dark:border-black text-xs w-16 text-right h-6 leading-6">
        {annualSavingsIndex === null ? '-' : formatPercent(annualSavingsIndex)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-black dark:border-black w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};

