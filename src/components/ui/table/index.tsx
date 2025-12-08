import React, { ReactNode } from "react";

// Props for Table
interface TableProps {
  children: ReactNode; // Table content (thead, tbody, etc.)
  className?: string; // Optional className for styling
}

// Props for TableHeader
interface TableHeaderProps {
  children: ReactNode; // Header row(s)
  className?: string; // Optional className for styling
  style?: React.CSSProperties; // Optional inline styles
}

// Props for TableBody
interface TableBodyProps {
  children: ReactNode; // Body row(s)
  className?: string; // Optional className for styling
}

// Props for TableRow
interface TableRowProps {
  children: ReactNode; // Cells (th or td)
  className?: string; // Optional className for styling
  style?: React.CSSProperties; // Optional inline styles
}

// Props for TableCell
interface TableCellProps {
  children?: ReactNode; // Cell content
  isHeader?: boolean; // If true, renders as <th>, otherwise <td>
  className?: string; // Optional className for styling
  colSpan?: number; // Column span
  style?: React.CSSProperties; // Optional inline styles
}

// Table Component
const Table: React.FC<TableProps> = ({ children, className }) => {
  return <table className={`min-w-full border-collapse ${className}`}>{children}</table>;
};

// TableHeader Component
const TableHeader: React.FC<TableHeaderProps> = ({ children, className, style }) => {
  return <thead className={className} style={style}>{children}</thead>;
};

// TableBody Component
const TableBody: React.FC<TableBodyProps> = ({ children, className }) => {
  return <tbody className={className}>{children}</tbody>;
};

// TableRow Component
const TableRow: React.FC<TableRowProps> = ({ children, className, style }) => {
  return <tr className={className} style={style}>{children}</tr>;
};

// TableCell Component
const TableCell: React.FC<TableCellProps> = ({
  children,
  isHeader = false,
  className,
  colSpan,
  style,
}) => {
  const CellTag = isHeader ? "th" : "td";
  return <CellTag className={` ${className}`} colSpan={colSpan} style={style}>{children}</CellTag>;
};

export { Table, TableHeader, TableBody, TableRow, TableCell };
