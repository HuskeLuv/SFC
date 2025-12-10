import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/utils/formatters";
import { FIXED_COLUMN_BODY_STYLES } from "./fixedColumns";

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
        className="px-2 font-bold text-white text-xs text-left h-6 leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[0],
          overflow: 'hidden',
          flexShrink: 0,
          borderRight: 'none'
        }}
      >
        Índice de Poupança Mensal
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white text-xs h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[1],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        -
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[2],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        -
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white text-xs text-right h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r border-gray-300"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[3],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none'
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
            className={`px-1 font-bold text-white border-t border-b border-gray-200 border-r border-gray-200 text-xs text-right h-6 leading-6 ${
              index === 0 ? 'border-l-0' : 'border-l border-gray-200'
            }`}
          >
            {savingsIndex === null ? '-' : formatPercent(savingsIndex)}
          </TableCell>
        );
      })}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
      <TableCell className="px-2 font-bold text-white border-t border-b border-gray-200 border border-gray-200 text-xs text-right h-6 leading-6" style={{ minWidth: '4rem' }}>
        {annualSavingsIndex === null ? '-' : formatPercent(annualSavingsIndex)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};

