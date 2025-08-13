"use client";
import React, { useState, useMemo } from "react";
import Spreadsheet from "react-spreadsheet";
import { tableData1, months } from "./mockTableData";

// Helper to parse currency string to number
const parseCurrency = (value: string) => {
  if (!value) return 0;
  return Number(
    value
      .replace(/[^\d,-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
};

const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A basic spreadsheet component using react-spreadsheet.
 */
export const BasicTableOne = () => {
  // Transform the mock data into the format required by react-spreadsheet
  const initialData = useMemo(() => {
    // Create the header row from the months data and make it read-only
    const header = [
      { value: "Total de Entradas", readOnly: true },
      ...months.map((month) => ({ value: month.label, readOnly: true })),
      { value: "Total", readOnly: true },
    ];

    // Calculate column totals
    const totals = months.map((month) => {
      return tableData1.reduce((sum, row) => {
        const value = row[month.key as keyof typeof row] as string;
        return sum + parseCurrency(value);
      }, 0);
    });

    const grandTotal = totals.reduce((sum, total) => sum + total, 0);

    // Create the total row
    const totalRow = [
      { value: "Entrada Fixa", readOnly: true },
      ...totals.map((total) => ({
        value: formatCurrency(total),
        readOnly: true,
      })),
      { value: formatCurrency(grandTotal), readOnly: true },
    ];

    // Create the data rows from tableData1
    const dataRows = tableData1.map((row) => {
      // The first column is the 'entradaFixa' which should be read-only
      const firstCol = { value: row.entradaFixa, readOnly: true };

      const rowTotal = months.reduce((sum, month) => {
        const rawValue = row[month.key as keyof typeof row] as string;
        return sum + parseCurrency(rawValue);
      }, 0);

      // The rest of the columns are the month values, which are editable
      const monthCells = months.map((month) => {
        const rawValue = row[month.key as keyof typeof row] as string;
        return {
          value: formatCurrency(parseCurrency(rawValue)),
        };
      });
      
      const totalCell = { value: formatCurrency(rowTotal), readOnly: true };

      return [firstCol, ...monthCells, totalCell];
    });

    return [header, totalRow, ...dataRows];
  }, []);

  const [data, setData] = useState(initialData);

  return (
    <div className="w-full">
      <Spreadsheet
        data={data}
        onChange={setData}
        className="custom-spreadsheet"
      />
      <style>{`
        .custom-spreadsheet table {
          width: 100%;
        }
        .custom-spreadsheet table td,
        .custom-spreadsheet table th {
          max-width: 90px;
          min-width: 60px;
          width: 6vw;
        }
      `}</style>
    </div>
  );
};

export default BasicTableOne;
