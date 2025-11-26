import React from "react";
import { TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHS } from "@/constants/cashflow";

interface TableHeaderComponentProps {
  showActionsColumn?: boolean;
}

export const TableHeaderComponent: React.FC<TableHeaderComponentProps> = ({ 
  showActionsColumn = false 
}) => (
  <TableHeader>
    <TableRow className="h-6" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell
        isHeader
        className="px-2 border-t border-b border-l border-black dark:border-black w-32 text-left h-6 text-xs leading-6"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Itens
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t border-b border-black dark:border-black w-40 h-6 text-xs leading-6"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Significado
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t border-b border-black dark:border-black w-16 text-center h-6 text-xs leading-6"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Rank
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t border-b border-r border-black dark:border-black w-16 text-right h-6 text-xs leading-6"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          % Receita
        </p>
      </TableCell>
      {MONTHS.map((month) => (
        <TableCell
          key={month}
          isHeader
          className="px-1 border border-black dark:border-black w-12 text-right h-6 text-xs leading-6"
        >
          <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
            {month}
          </p>
        </TableCell>
      ))}
      <TableCell
        isHeader
        className="px-2 border border-black dark:border-black w-16 text-right h-6 text-xs leading-6"
      >
        <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
          Total Anual
        </p>
      </TableCell>
      {showActionsColumn && (
        <TableCell
          isHeader
          className="px-2 border border-black dark:border-black w-8 h-6 text-xs leading-6"
        >
          <p className="font-medium text-gray-700 text-xs dark:text-gray-400">
            Ações
          </p>
        </TableCell>
      )}
    </TableRow>
  </TableHeader>
); 