'use client';
import React from 'react';
import { useIRStocksUs } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { formatBRL, formatYearMonth } from './irFormatters';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import { ResponsiveCardList } from '@/components/ui/table/ResponsiveTable';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

export default function IRStocksUs() {
  const { data, isLoading, error } = useIRStocksUs();
  const isBelowLg = useIsBelowLg();

  if (isLoading) return <LoadingSpinner text="Carregando apuração de Stocks US..." />;
  if (error)
    return (
      <IRStateMessage
        variant="error"
        title="Erro ao carregar Stocks US"
        description={(error as Error).message}
      />
    );
  if (!data || data.meses.length === 0)
    return (
      <IRStateMessage
        variant="empty"
        title="Sem operações de Stocks US ou REITs"
        description="As operações precisam estar cadastradas com a cotação do dólar (cotacaoMoeda) usada no dia. BDRs seguem regras de Renda Variável BR."
      />
    );

  const totalIR = data.meses.reduce((s, m) => s + m.irDevido, 0);
  const totalVendas = data.meses.reduce((s, m) => s + m.vendasTotalBrl, 0);
  const totalLucro = data.meses.reduce((s, m) => s + m.lucroBrutoBrl, 0);
  const mesesComIR = data.meses.filter((m) => m.irDevido > 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <IRSummaryCard
          label="IR devido sobre lucro"
          value={formatBRL(totalIR)}
          subtext={`${mesesComIR} meses com DARF`}
          highlight
        />
        <IRSummaryCard
          label="Total alienado em BRL"
          value={formatBRL(totalVendas)}
          subtext="Vendas convertidas pelo PTAX-venda"
        />
        <IRSummaryCard
          label="Lucro/prejuízo total"
          value={formatBRL(totalLucro)}
          color={
            totalLucro > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : totalLucro < 0
                ? 'text-red-600 dark:text-red-400'
                : undefined
          }
        />
        <IRSummaryCard
          label="Limite mensal de isenção"
          value={formatBRL(35000)}
          subtext="Vendas em ME até R$ 35k/mês são isentas"
        />
      </div>

      {isBelowLg ? (
        <ResponsiveCardList<(typeof data.meses)[number]>
          ariaLabel="Apuração mensal de Stocks US"
          rows={data.meses}
          getRowKey={(m) => m.yearMonth}
          columns={[
            {
              id: 'mes',
              header: 'Mês',
              mobile: 'primary',
              cell: (m) => formatYearMonth(m.yearMonth),
            },
            {
              id: 'status',
              header: 'Status',
              mobile: 'subtitle',
              cell: (m) => (m.isento ? 'Isento' : m.irDevido > 0 ? 'DARF' : 'Sem IR'),
            },
            {
              id: 'ir',
              header: 'IR a recolher',
              mobile: 'value',
              cell: (m) => (m.irDevido > 0 ? formatBRL(m.irDevido) : '—'),
            },
            {
              id: 'vendas',
              header: 'Vendas',
              mobile: 'field',
              cell: (m) => formatBRL(m.vendasTotalBrl),
            },
            {
              id: 'lucro',
              header: 'Lucro/Prej.',
              mobile: 'field',
              cell: (m) => (
                <span
                  className={m.lucroBrutoBrl < 0 ? 'text-[#D92D20] dark:text-[#F97066]' : undefined}
                >
                  {formatBRL(m.lucroBrutoBrl)}
                </span>
              ),
            },
          ]}
        />
      ) : (
        <div className={TABLE_STYLES.wrapper}>
          <table className={TABLE_STYLES.table}>
            <thead>
              <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                <Th>Mês</Th>
                <Th align="right">Vendas (BRL)</Th>
                <Th align="right">Lucro/Prejuízo</Th>
                <Th align="center">Status</Th>
                <Th align="right">IR a recolher</Th>
              </tr>
            </thead>
            <tbody>
              {data.meses.map((m) => (
                <tr key={m.yearMonth} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                  <td
                    className={`${TABLE_STYLES.td} whitespace-nowrap font-medium text-gray-900 dark:text-white`}
                  >
                    {formatYearMonth(m.yearMonth)}
                  </td>
                  <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
                    {formatBRL(m.vendasTotalBrl)}
                  </td>
                  <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-medium`}>
                    <span
                      className={
                        m.lucroBrutoBrl > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : m.lucroBrutoBrl < 0
                            ? 'text-red-600 dark:text-red-400'
                            : ''
                      }
                    >
                      {formatBRL(m.lucroBrutoBrl)}
                    </span>
                  </td>
                  <td className={`${TABLE_STYLES.td} whitespace-nowrap text-center`}>
                    {m.isento ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Isento
                      </span>
                    ) : m.irDevido > 0 ? (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        DARF
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        —
                      </span>
                    )}
                  </td>
                  <td
                    className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-semibold text-gray-900 dark:text-white`}
                  >
                    {m.irDevido > 0 ? formatBRL(m.irDevido) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return <th className={`${TABLE_STYLES.th} ${alignClass}`}>{children}</th>;
}
