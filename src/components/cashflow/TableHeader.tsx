import React from "react";
import { TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHS } from "@/constants/cashflow";

interface TableHeaderComponentProps {
  showActionsColumn?: boolean;
}

export const TableHeaderComponent: React.FC<TableHeaderComponentProps> = ({ 
  showActionsColumn = false 
}) => (
  <TableHeader className="sticky top-0 z-30" style={{ isolation: 'isolate' }}>
    <TableRow 
      className="h-6" 
      style={{ 
        fontFamily: 'Calibri, sans-serif', 
        fontSize: '12px',
        boxShadow: '0 2px 0 0 black, 0 -2px 0 0 black',
        backgroundColor: 'white'
      }}
    >
      <TableCell
        isHeader
        className="px-2 border-t-2 border-b-2 border-l border-black dark:border-black w-32 text-center h-6 text-xs leading-6 bg-white dark:bg-white z-30"
        style={{ 
          backgroundColor: 'white',
          position: 'sticky',
          left: 0,
          zIndex: 200,
          minWidth: '128px',
          maxWidth: '128px',
          width: '128px',
          boxShadow: '1px 0 0 0 rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}
      >
        <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
          Itens
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t-2 border-b-2 border-black dark:border-black w-40 text-center h-6 text-xs leading-6 bg-white dark:bg-white z-30"
        style={{ 
          backgroundColor: 'white',
          position: 'sticky',
          left: '128px',
          zIndex: 201,
          boxShadow: '2px 0 0 0 black',
          minWidth: '160px',
          maxWidth: '160px',
          width: '160px',
          overflow: 'hidden'
        }}
      >
        <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
          Significado
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t-2 border-b-2 border-black dark:border-black w-16 text-center h-6 text-xs leading-6 bg-white dark:bg-white z-30"
        style={{ 
          backgroundColor: 'white',
          position: 'sticky',
          left: '288px',
          zIndex: 202,
          boxShadow: '2px 0 0 0 black',
          minWidth: '64px',
          maxWidth: '64px',
          width: '64px',
          overflow: 'hidden'
        }}
      >
        <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
          Rank
        </p>
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t-2 border-b-2 border-r border-black dark:border-black w-16 text-center h-6 text-xs leading-6 bg-white dark:bg-white z-30"
        style={{ 
          backgroundColor: 'white',
          position: 'sticky',
          left: '352px',
          zIndex: 203,
          boxShadow: '2px 0 0 0 black',
          minWidth: '64px',
          maxWidth: '64px',
          width: '64px',
          overflow: 'hidden'
        }}
      >
        <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
          % Receita
        </p>
      </TableCell>
      {MONTHS.map((month, index) => (
        <TableCell
          key={month}
          isHeader
          id={index === 0 ? 'first-month-cell' : undefined}
          className="px-1 border-t-2 border-b-2 border-l border-r border-black dark:border-black w-12 text-center h-6 text-xs leading-6 bg-white dark:bg-white z-30"
          style={{ backgroundColor: 'white' }}
        >
          <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
            {month}
          </p>
        </TableCell>
      ))}
      {/* Coluna vazia para espaçamento */}
      <TableCell
        isHeader
        className="px-0 w-[10px] h-6 text-xs leading-6 bg-white dark:bg-white border-0 p-0 relative"
        style={{ 
          backgroundColor: 'white', 
          border: 'none',
          padding: 0,
          position: 'relative',
          overflow: 'visible'
        }}
      >
        <div 
          style={{
            position: 'absolute',
            top: '-3px',
            left: '1px',
            right: 0,
            bottom: '-3px',
            backgroundColor: 'white',
            zIndex: 35
          }}
        />
      </TableCell>
      <TableCell
        isHeader
        className="px-2 border-t-2 border-b-2 border-l border-r border-black dark:border-black w-16 text-center h-6 text-xs leading-6 bg-white dark:bg-white z-30"
        style={{ backgroundColor: 'white' }}
      >
        <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
          Total Anual
        </p>
      </TableCell>
      {showActionsColumn && (
        <TableCell
          isHeader
          className="px-2 border-t-2 border-b-2 border-l border-r border-black dark:border-black w-8 text-center h-6 text-xs leading-6 bg-white dark:bg-white z-30"
          style={{ backgroundColor: 'white' }}
        >
          <p className="font-bold text-gray-700 text-xs dark:text-gray-400 whitespace-nowrap">
            Ações
          </p>
        </TableCell>
      )}
    </TableRow>
  </TableHeader>
); 