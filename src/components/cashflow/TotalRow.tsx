import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/utils/formatters";

interface TotalRowProps {
  totalByMonth: number[];
  totalAnnual: number;
  showActionsColumn?: boolean;
}

export const TotalRow: React.FC<TotalRowProps> = ({ totalByMonth, totalAnnual, showActionsColumn = false }) => (
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
      Saldo do mês (Lucro Líquido)
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
    {totalByMonth.map((value, index) => {
      const numValue = value || 0;
      const colorClass = numValue >= 0 
        ? "text-white" 
        : "text-red-600 dark:text-red-400";
      return (
        <TableCell key={index} className={`px-1 font-bold border border-black dark:border-black text-xs w-12 text-right h-6 leading-6 ${colorClass}`}>
          {formatCurrency(numValue)}
        </TableCell>
      );
    })}
    {/* Coluna vazia para espaçamento */}
    <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
    <TableCell className={`px-2 font-bold border border-black dark:border-black text-xs w-16 text-right h-6 leading-6 ${totalAnnual >= 0 ? "text-white" : "text-red-600 dark:text-red-400"}`}>
      {formatCurrency(totalAnnual)}
    </TableCell>
    {showActionsColumn && (
      <TableCell className="px-2 border border-black dark:border-black w-8 h-6 leading-6"></TableCell>
    )}
  </TableRow>
); 