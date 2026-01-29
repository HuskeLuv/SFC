import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/utils/formatters";
import { FIXED_COLUMN_BODY_STYLES } from "./fixedColumns";

interface InvestmentIncomeRowProps {
  valuesByMonth: number[];
  totalAnnual: number;
  showActionsColumn?: boolean;
}

export const InvestmentIncomeRow: React.FC<InvestmentIncomeRowProps> = ({
  valuesByMonth,
  totalAnnual,
  showActionsColumn = false,
}) => {
  const calculatedTotal = valuesByMonth.reduce((sum, value) => sum + value, 0);
  const annualTotal = Number.isFinite(totalAnnual) ? totalAnnual : calculatedTotal;

  return (
    <TableRow className="h-6 bg-[#998256] text-white w-full" style={{ fontFamily: "Calibri, sans-serif", fontSize: "12px" }}>
      <TableCell
        className="px-2 font-bold text-white text-xs text-left h-6 leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0"
        style={{
          position: "sticky",
          backgroundColor: "#998256",
          ...FIXED_COLUMN_BODY_STYLES[0],
          overflow: "hidden",
          flexShrink: 0,
          borderRight: "none",
        }}
      >
        <span>Receitas de Investimentos</span>
      </TableCell>
      <TableCell
        className="px-2 font-bold text-white text-xs h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{
          position: "sticky",
          backgroundColor: "#998256",
          ...FIXED_COLUMN_BODY_STYLES[1],
          overflow: "hidden",
          flexShrink: 0,
          borderLeft: "none",
          borderRight: "none",
        }}
      >
        -
      </TableCell>
      <TableCell
        className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{
          position: "sticky",
          backgroundColor: "#998256",
          ...FIXED_COLUMN_BODY_STYLES[2],
          overflow: "hidden",
          flexShrink: 0,
          borderLeft: "none",
          borderRight: "none",
        }}
      >
        -
      </TableCell>
      <TableCell
        className="px-2 font-bold text-white text-xs text-right h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r border-gray-300"
        style={{
          position: "sticky",
          backgroundColor: "#998256",
          ...FIXED_COLUMN_BODY_STYLES[3],
          overflow: "hidden",
          flexShrink: 0,
          borderLeft: "none",
        }}
      >
        -
      </TableCell>
      {valuesByMonth.map((value, index) => {
        const borderClass = index === 0 ? "border-l-0" : "border-l border-gray-200";
        return (
          <TableCell
            key={index}
            className={`px-1 font-bold text-white border-t border-b border-gray-200 border-r border-gray-200 text-xs text-right h-6 leading-6 ${borderClass}`}
          >
            <span>{formatCurrency(value || 0)}</span>
          </TableCell>
        );
      })}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
      <TableCell
        className="px-2 font-bold text-white border-t border-b border-gray-200 border border-gray-200 text-xs text-right h-6 leading-6"
        style={{ minWidth: "4rem" }}
      >
        {formatCurrency(annualTotal)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};
