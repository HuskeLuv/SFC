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
    <TableCell className="px-2 font-bold text-white border-t border-b border-l border-black dark:border-black text-xs w-32 text-left h-6 leading-6">
      Saldo do mês (Lucro Líquido)
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
    {totalByMonth.map((value, index) => (
      <TableCell key={index} className="px-1 font-bold text-white border border-black dark:border-black text-xs w-12 text-right h-6 leading-6">
        {formatCurrency(value || 0)}
      </TableCell>
    ))}
    <TableCell className="px-2 font-bold text-white border border-black dark:border-black text-xs w-16 text-right h-6 leading-6">
      {formatCurrency(totalAnnual)}
    </TableCell>
    {showActionsColumn && (
      <TableCell className="px-2 border border-black dark:border-black w-8 h-6 leading-6"></TableCell>
    )}
  </TableRow>
); 