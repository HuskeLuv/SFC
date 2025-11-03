import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/utils/formatters";

interface TotalRowProps {
  totalByMonth: number[];
  totalAnnual: number;
}

export const TotalRow: React.FC<TotalRowProps> = ({ totalByMonth, totalAnnual }) => (
  <TableRow className="bg-gray-200 dark:bg-gray-700">
    <TableCell className="px-2 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-xs w-32">
      Saldo
    </TableCell>
    <TableCell className="px-2 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
      -
    </TableCell>
    {totalByMonth.map((value, index) => (
      <TableCell key={index} className="px-1 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-12 text-right">
        {value ? formatCurrency(value) : '-'}
      </TableCell>
    ))}
    <TableCell className="px-2 py-2 font-bold text-gray-800 border border-gray-100 dark:border-white/[0.05] text-xs dark:text-white w-16 text-right">
      {formatCurrency(totalAnnual)}
    </TableCell>
  </TableRow>
); 