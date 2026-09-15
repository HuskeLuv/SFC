import React from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import Badge from '@/components/ui/badge/Badge';

interface AportesResgates {
  clientId: string;
  name: string;
  email: string;
  totalAportes: number;
  totalResgates: number;
  tendencia: 'positive' | 'negative';
}

interface AportesResgatesTableProps {
  data: AportesResgates[];
  emptyMessage?: string;
  currencyFormatter: (value: number) => string;
}

const AportesResgatesTable: React.FC<AportesResgatesTableProps> = ({
  data,
  emptyMessage = 'Nenhum dado disponível',
  currencyFormatter,
}) => {
  if (data.length === 0) {
    return (
      <Card>
        <CardTitle>Resumo de Aportes & Resgates dos Clientes</CardTitle>
        <div className="mt-4 flex items-center justify-center rounded-lg border border-dashed border-gray-200 py-8 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Resumo de Aportes & Resgates dos Clientes</CardTitle>
      <div className={`mt-4 ${TABLE_STYLES.wrapper}`}>
        <Table className={TABLE_STYLES.table}>
          <TableHeader>
            <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <TableCell isHeader className={`${TABLE_STYLES.th} text-left`}>
                Cliente
              </TableCell>
              <TableCell isHeader className={`${TABLE_STYLES.th} text-right`}>
                Total Aportado
              </TableCell>
              <TableCell isHeader className={`${TABLE_STYLES.th} text-right`}>
                Total Resgatado
              </TableCell>
              <TableCell isHeader className={`${TABLE_STYLES.th} text-center`}>
                Tendência
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.clientId} className={TABLE_STYLES.row}>
                <TableCell className={TABLE_STYLES.td}>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-white/90">
                      {item.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{item.email}</span>
                  </div>
                </TableCell>
                <TableCell className={`${TABLE_STYLES.td} text-right`}>
                  {currencyFormatter(item.totalAportes)}
                </TableCell>
                <TableCell className={`${TABLE_STYLES.td} text-right`}>
                  {currencyFormatter(item.totalResgates)}
                </TableCell>
                <TableCell className={`${TABLE_STYLES.td} text-center`}>
                  <Badge
                    color={item.tendencia === 'positive' ? 'success' : 'error'}
                    size="sm"
                    variant="light"
                  >
                    {item.tendencia === 'positive' ? 'Positivo' : 'Negativo'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default AportesResgatesTable;
