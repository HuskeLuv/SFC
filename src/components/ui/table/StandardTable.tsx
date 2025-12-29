import React from "react";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "./index";

/**
 * Componentes de tabela padronizados baseados no design do Fluxo de Caixa
 * 
 * PADRÃO VISUAL:
 * - Altura de linha: h-6 (24px)
 * - Padding horizontal: px-2
 * - Font size: text-xs (12px)
 * - Header: bg-white, font-bold, text-gray-700, border-t border-b border-gray-200
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

  const bgColor = headerBgColor || "white";

  return (
    <TableCell
      isHeader
      colSpan={colSpan}
      className={`px-2 py-2 border-t border-b border-gray-200 text-xs whitespace-nowrap cursor-pointer ${alignClass} ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      <p className="font-bold text-black text-xs whitespace-nowrap">
        {children}
      </p>
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

  const totalClass = isTotal ? "font-semibold text-black" : "font-normal text-black";

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
  const bgColor = headerBgColor || "white";

  return (
    <TableHeader
      style={sticky ? {
        position: "sticky",
        top: 0,
        zIndex: 400,
        backgroundColor: bgColor,
        isolation: "isolate",
      } : headerBgColor ? {
        backgroundColor: bgColor,
      } : undefined}
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
  const bgColor = headerBgColor || "white";

  return (
    <TableRow 
      className={`h-6 ${className}`}
      style={{
        backgroundColor: bgColor,
      }}
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
  const baseClass = "h-6 bg-white";
  const hoverClass = "";
  const totalClass = isTotal ? "border-t-2 border-gray-300" : "border-b border-gray-200";

  return (
    <TableRow 
      className={`${baseClass} ${hoverClass} ${totalClass} ${className}`}
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
      <Table className={`w-full ${className}`}>
        {children}
      </Table>
    </div>
  );
};

export { TableBody, TableRow };

