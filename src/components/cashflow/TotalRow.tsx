import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/utils/formatters";
import { FIXED_COLUMN_BODY_STYLES } from "./fixedColumns";

interface TotalRowProps {
  totalByMonth: number[];
  totalAnnual: number;
  showActionsColumn?: boolean;
}

export const TotalRow: React.FC<TotalRowProps> = ({ totalByMonth, totalAnnual, showActionsColumn = false }) => (
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
      Saldo do mês (Lucro Líquido)
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
    {totalByMonth.map((value, index) => {
      const numValue = value || 0;
      const colorClass = numValue >= 0 
        ? "text-white" 
        : "text-red-600 dark:text-red-400";
      return (
        <TableCell key={index} className={`px-1 font-bold border-t border-b border-gray-200 border-r border-gray-200 text-xs text-right h-6 leading-6 ${
          index === 0 ? 'border-l-0' : 'border-l border-gray-200'
        } ${colorClass}`} style={{ minWidth: '3rem' }}>
          {formatCurrency(numValue)}
        </TableCell>
      );
    })}
    {/* Coluna vazia para espaçamento */}
    <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
    <TableCell className={`px-2 font-bold border-t border-b border-gray-200 border border-gray-200 text-xs text-right h-6 leading-6 ${totalAnnual >= 0 ? "text-white" : "text-red-600 dark:text-red-400"}`} style={{ minWidth: '4rem' }}>
      {formatCurrency(totalAnnual)}
    </TableCell>
    {showActionsColumn && (
      <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6"></TableCell>
    )}
  </TableRow>
); 