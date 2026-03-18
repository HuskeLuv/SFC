import React from "react";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "./index";

/**
 * Componentes de tabela padronizados baseados no design do Fluxo de Caixa
 *
 * PADRÃO VISUAL:
 * - Altura de linha: h-6 (24px)
 * - Padding horizontal: px-2
 * - Font size: text-xs (12px)
 * - Header: bg-gray-50, font-bold, text-gray-700, border-t border-b border-gray-200
 * - Células: bg-white, text-gray-800, hover:bg-gray-50
 * - Bordas sutis entre linhas
 */

interface StandardTableHeaderCellProps {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  colSpan?: number;
  headerBgColor?: string;
}

export const StandardTableHeaderCell: React.FC<StandardTableHeaderCellProps> = ({
  children,
  align = "left",
  className = "",
  colSpan,
  headerBgColor,
}) => {
  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align];

  const useCustomBg = Boolean(headerBgColor);

  return (
    <TableCell
      isHeader
      colSpan={colSpan}
      className={`px-2 py-2 border-t border-b border-gray-200 dark:border-gray-700 text-xs whitespace-nowrap ${alignClass} ${
        !useCustomBg
          ? "bg-gray-50 font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          : ""
      } ${className}`}
      style={useCustomBg ? { backgroundColor: headerBgColor } : undefined}
    >
      <p className="font-bold text-xs whitespace-nowrap">{children}</p>
    </TableCell>
  );
};

interface StandardTableBodyCellProps {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  colSpan?: number;
  isTotal?: boolean;
}

export const StandardTableBodyCell: React.FC<StandardTableBodyCellProps> = ({
  children,
  align = "left",
  className = "",
  colSpan,
  isTotal = false,
}) => {
  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align];

  const totalClass = isTotal
    ? "font-semibold text-gray-900 dark:text-white"
    : "font-normal text-gray-800 dark:text-gray-200";

  return (
    <TableCell
      colSpan={colSpan}
      className={`px-2 text-xs leading-6 h-6 ${totalClass} ${alignClass} ${className}`}
    >
      {children}
    </TableCell>
  );
};

interface StandardTableHeaderProps {
  children: React.ReactNode;
  sticky?: boolean;
  headerBgColor?: string;
}

export const StandardTableHeader: React.FC<StandardTableHeaderProps> = ({
  children,
  sticky = false,
  headerBgColor,
}) => {
  const useCustomBg = Boolean(headerBgColor);

  return (
    <TableHeader
      className={!useCustomBg ? "bg-gray-50 dark:bg-gray-800" : ""}
      style={
        sticky
          ? {
              position: "sticky",
              top: 0,
              zIndex: 400,
              ...(useCustomBg && { backgroundColor: headerBgColor }),
              isolation: "isolate",
            }
          : useCustomBg
            ? { backgroundColor: headerBgColor }
            : undefined
      }
    >
      {children}
    </TableHeader>
  );
};

interface StandardTableHeaderRowProps {
  children: React.ReactNode;
  className?: string;
  headerBgColor?: string;
}

export const StandardTableHeaderRow: React.FC<StandardTableHeaderRowProps> = ({
  children,
  className = "",
  headerBgColor,
}) => {
  const useCustomBg = Boolean(headerBgColor);

  return (
    <TableRow
      className={`h-6 ${!useCustomBg ? "bg-gray-50 dark:bg-gray-800" : ""} ${className}`}
      style={useCustomBg ? { backgroundColor: headerBgColor } : undefined}
    >
      {children}
    </TableRow>
  );
};

interface StandardTableRowProps {
  children: React.ReactNode;
  className?: string;
  isTotal?: boolean;
  onClick?: () => void;
}

export const StandardTableRow: React.FC<StandardTableRowProps> = ({
  children,
  className = "",
  isTotal = false,
  onClick,
}) => {
  const baseClass = "h-6 bg-white dark:bg-white/[0.03]";
  const totalClass = isTotal
    ? "border-t-2 border-gray-300 dark:border-gray-600"
    : "border-b border-gray-200 dark:border-gray-700";

  return (
    <TableRow
      className={`${baseClass} ${totalClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </TableRow>
  );
};

interface StandardTableProps {
  children: React.ReactNode;
  className?: string;
}

export const StandardTable: React.FC<StandardTableProps> = ({
  children,
  className = "",
}) => {
  return (
    <div className="overflow-x-auto">
      <Table className={`w-full text-xs ${className}`}>
        {children}
      </Table>
    </div>
  );
};

export { TableBody, TableRow };

