import React from "react";
import { TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHS } from "@/constants/cashflow";

export const TableHeaderComponent: React.FC = () => (
  <TableHeader className="border-t border-gray-100 dark:border-white/[0.05]">
    <TableRow>
      <TableCell
        isHeader
        className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-32"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Itens
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-16 text-right"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          % Receita
        </p>
      </TableCell>
      {MONTHS.map((month) => (
        <TableCell
          key={month}
          isHeader
          className="px-1 py-2 border border-gray-100 dark:border-white/[0.05] w-12 text-right"
        >
          <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
            {month}
          </p>
        </TableCell>
      ))}
      <TableCell
        isHeader
        className="px-2 py-2 border border-gray-100 dark:border-white/[0.05] w-16 text-right"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Total Anual
        </p>
      </TableCell>
    </TableRow>
  </TableHeader>
); 