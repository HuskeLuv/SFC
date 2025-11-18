import React from "react";
import { TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHS } from "@/constants/cashflow";

interface TableHeaderComponentProps {
  showActionsColumn?: boolean;
}

export const TableHeaderComponent: React.FC<TableHeaderComponentProps> = ({ 
  showActionsColumn = false 
}) => (
  <TableHeader className="border-t border-black dark:border-black">
    <TableRow>
      <TableCell
        isHeader
        className="px-2 py-2 border border-black dark:border-black w-32 text-left"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Itens
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 py-2 border border-black dark:border-black w-40"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Significado
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 py-2 border border-black dark:border-black w-16 text-center"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Rank
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 py-2 border border-black dark:border-black w-16 text-right"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          % Receita
        </p>
      </TableCell>
      {MONTHS.map((month) => (
        <TableCell
          key={month}
          isHeader
          className="px-1 py-2 border border-black dark:border-black w-12 text-right"
        >
          <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
            {month}
          </p>
        </TableCell>
      ))}
      <TableCell
        isHeader
        className="px-2 py-2 border border-black dark:border-black w-16 text-right"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Total Anual
        </p>
      </TableCell>
      {showActionsColumn && (
        <TableCell
          isHeader
          className="px-2 py-2 border border-black dark:border-black w-8"
        >
          <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
            Ações
          </p>
        </TableCell>
      )}
    </TableRow>
  </TableHeader>
); 