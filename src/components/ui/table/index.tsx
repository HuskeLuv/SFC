import React, { ReactNode, forwardRef } from 'react';

// Props for Table
interface TableProps {
  children: ReactNode; // Table content (thead, tbody, etc.)
  className?: string; // Optional className for styling
  style?: React.CSSProperties; // Optional inline styles
  'aria-label'?: string; // Accessible name announced by screen readers
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
  onClick?: () => void; // Optional click handler
}

// Props for TableCell
interface TableCellProps {
  children?: ReactNode; // Cell content
  isHeader?: boolean; // If true, renders as <th>, otherwise <td>
  className?: string; // Optional className for styling
  colSpan?: number; // Column span
  rowSpan?: number; // Row span
  style?: React.CSSProperties; // Optional inline styles
  id?: string; // Optional id attribute
  scope?: 'col' | 'row' | 'colgroup' | 'rowgroup'; // Header scope (th only)
  title?: string; // Native tooltip
}

// Table Component
const Table: React.FC<TableProps> = ({ children, className, style, 'aria-label': ariaLabel }) => {
  return (
    <table
      className={`min-w-full border-collapse ${className}`}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </table>
  );
};

// TableHeader Component
const TableHeader: React.FC<TableHeaderProps> = ({ children, className, style }) => {
  return (
    <thead className={className} style={style}>
      {children}
    </thead>
  );
};

// TableBody Component
const TableBody: React.FC<TableBodyProps> = ({ children, className }) => {
  return <tbody className={className}>{children}</tbody>;
};

// TableRow Component
// forwardRef: o drag-and-drop do fluxo de caixa (@dnd-kit) precisa do nó <tr>.
const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ children, className, style, onClick }, ref) => {
    return (
      <tr ref={ref} className={className} style={style} onClick={onClick}>
        {children}
      </tr>
    );
  },
);
TableRow.displayName = 'TableRow';

// TableCell Component
const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ children, isHeader = false, className, colSpan, rowSpan, style, id, scope, title }, ref) => {
    const CellTag = isHeader ? 'th' : 'td';
    return (
      <CellTag
        ref={ref}
        id={id}
        className={` ${className}`}
        colSpan={colSpan}
        rowSpan={rowSpan}
        style={style}
        scope={isHeader ? (scope ?? 'col') : undefined}
        title={title}
      >
        {children}
      </CellTag>
    );
  },
);

TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableCell };
