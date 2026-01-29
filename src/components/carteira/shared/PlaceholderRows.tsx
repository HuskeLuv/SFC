import React from "react";
import { StandardTableRow, StandardTableBodyCell } from "@/components/ui/table/StandardTable";
import { TableRow, TableCell } from "@/components/ui/table";

type PlaceholderRowsProps = {
  count: number;
  colSpan: number;
  rowClassName?: string;
  cellClassName?: string;
};

const PlaceholderContent: React.FC = () => {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2 w-24 rounded bg-gray-200 dark:bg-gray-700/60" />
      <span className="text-gray-400">—</span>
    </div>
  );
};

export const StandardTablePlaceholderRows: React.FC<PlaceholderRowsProps> = ({
  count,
  colSpan,
  rowClassName = "",
  cellClassName = "",
}) => {
  if (count <= 0) return null;

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <StandardTableRow
          key={`placeholder-${index}`}
          className={`bg-gray-50/60 dark:bg-white/[0.02] ${rowClassName}`}
        >
          <StandardTableBodyCell
            colSpan={colSpan}
            align="left"
            className={`text-gray-400 italic ${cellClassName}`}
          >
            <PlaceholderContent />
          </StandardTableBodyCell>
        </StandardTableRow>
      ))}
    </>
  );
};

export const BasicTablePlaceholderRows: React.FC<PlaceholderRowsProps> = ({
  count,
  colSpan,
  rowClassName = "",
  cellClassName = "",
}) => {
  if (count <= 0) return null;

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <tr
          key={`placeholder-${index}`}
          className={`border-b border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-white/[0.02] ${rowClassName}`}
        >
          <td colSpan={colSpan} className={`px-2 py-2 text-xs text-gray-400 italic ${cellClassName}`}>
            <PlaceholderContent />
          </td>
        </tr>
      ))}
    </>
  );
};

export const UiTablePlaceholderRows: React.FC<PlaceholderRowsProps> = ({
  count,
  colSpan,
  rowClassName = "",
  cellClassName = "",
}) => {
  if (count <= 0) return null;

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <TableRow
          key={`placeholder-${index}`}
          className={`border-b border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-white/[0.02] ${rowClassName}`}
        >
          <TableCell colSpan={colSpan} className={`px-2 py-2 text-xs text-gray-400 italic ${cellClassName}`}>
            <PlaceholderContent />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
};
