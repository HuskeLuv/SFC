import React, { useMemo, useState } from 'react';
import { GroupedProventoData } from '@/hooks/useProventos';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import { ResponsiveCardList } from '@/components/ui/table/ResponsiveTable';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

type GroupByType = 'ativo' | 'classe' | 'tipo';

interface ProventosDistribuicaoTableProps {
  grouped: Record<string, GroupedProventoData>;
  groupBy: GroupByType;
}

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPercent = (value: number | undefined) => `${(value ?? 0).toFixed(2)}%`;

const formatNumber = (value: number | undefined) =>
  (value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

type SortKey = 'ativo' | 'total';

export default function ProventosDistribuicaoTable({
  grouped,
  groupBy,
}: ProventosDistribuicaoTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const isBelowLg = useIsBelowLg();

  const entries = useMemo(() => {
    const raw = Object.entries(grouped);
    const sorted = [...raw].sort((a, b) => {
      if (sortKey === 'ativo') {
        return sortDir === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
      }
      return sortDir === 'asc' ? a[1].total - b[1].total : b[1].total - a[1].total;
    });
    return sorted;
  }, [grouped, sortKey, sortDir]);

  const total = useMemo(() => entries.reduce((sum, [, data]) => sum + data.total, 0), [entries]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Celular (PWA fase 1): ranking em cartões, do maior total para o menor (a ordem da tabela).
  if (isBelowLg) {
    type Entry = (typeof entries)[number];
    const pct = (data: Entry[1]) => (total > 0 ? (data.total / total) * 100 : 0);
    return (
      <ResponsiveCardList<Entry>
        ariaLabel="Distribuição dos proventos"
        rows={entries}
        getRowKey={([name]) => name}
        emptyState="Nenhum provento encontrado no período selecionado"
        total={{
          label: 'Total',
          cells: { total: formatCurrency(total) },
        }}
        columns={[
          {
            id: 'nome',
            header: groupBy === 'ativo' ? 'Ativo' : groupBy === 'classe' ? 'Classe' : 'Tipo',
            mobile: 'primary',
            cell: ([name, data]) => (groupBy === 'ativo' ? data.items[0]?.symbol || name : name),
          },
          ...(groupBy === 'ativo'
            ? [
                {
                  id: 'classe',
                  header: 'Classe',
                  mobile: 'subtitle' as const,
                  cell: ([name, data]: Entry) => {
                    const symbol = data.items[0]?.symbol ?? '';
                    const sub = [symbol && symbol !== name ? name : '', data.classe ?? '']
                      .filter(Boolean)
                      .join(' · ');
                    return sub || null;
                  },
                },
              ]
            : []),
          {
            id: 'total',
            header: 'Total acumulado',
            mobile: 'value',
            cell: ([, data]) => formatCurrency(data.total),
          },
          {
            id: 'pct',
            header: '% do total',
            mobile: 'field',
            cell: ([, data]) => `${pct(data).toFixed(2)}%`,
          },
          ...(groupBy === 'ativo'
            ? [
                {
                  id: 'yoc',
                  header: 'YoC',
                  mobile: 'field' as const,
                  cell: ([, data]: Entry) => (data.yoc != null ? formatPercent(data.yoc) : '—'),
                },
                {
                  id: 'dy',
                  header: 'Div. Yield',
                  mobile: 'field' as const,
                  cell: ([, data]: Entry) =>
                    data.dividendYield != null ? formatPercent(data.dividendYield) : '—',
                },
                {
                  id: 'qtd',
                  header: 'Qtd. atual',
                  mobile: 'detail' as const,
                  cell: ([, data]: Entry) =>
                    data.quantidadeAtual != null ? formatNumber(data.quantidadeAtual) : '—',
                },
                {
                  id: 'pm',
                  header: 'P. médio atual',
                  mobile: 'detail' as const,
                  cell: ([, data]: Entry) =>
                    data.precoMedio != null ? formatCurrency(data.precoMedio) : '—',
                },
                {
                  id: 'ult',
                  header: 'Últ. provento',
                  mobile: 'detail' as const,
                  cell: ([, data]: Entry) =>
                    data.ultimoProvento != null ? formatCurrency(data.ultimoProvento) : '—',
                },
              ]
            : []),
        ]}
      />
    );
  }

  if (groupBy !== 'ativo') {
    // Layout simples para agrupamentos por classe / tipo
    return (
      <div className={TABLE_STYLES.wrapper}>
        <table className={TABLE_STYLES.table}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th className={`${TABLE_STYLES.th} text-left`}>
                {groupBy === 'classe' ? 'Classe' : 'Tipo'}
              </th>
              <th className={`${TABLE_STYLES.th} text-right`}>Total Acumulado</th>
              <th className={`${TABLE_STYLES.th} text-right`}>%</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, data]) => {
              const percentage = total > 0 ? (data.total / total) * 100 : 0;
              return (
                <tr key={name} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                  <td className={TABLE_STYLES.td}>{name}</td>
                  <td className={`${TABLE_STYLES.td} text-right font-medium`}>
                    {formatCurrency(data.total)}
                  </td>
                  <td className={`${TABLE_STYLES.td} text-right`}>{percentage.toFixed(2)}%</td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr className={TABLE_STYLES.placeholderRow}>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Nenhum provento encontrado no período selecionado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Tabela rica por ATIVO (estilo Kinvo)
  return (
    <div className={TABLE_STYLES.wrapper}>
      <table className={TABLE_STYLES.table}>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th
              className={`${TABLE_STYLES.compact.th} cursor-pointer select-none text-left`}
              onClick={() => toggleSort('ativo')}
            >
              Ativo {sortKey === 'ativo' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className={`${TABLE_STYLES.compact.th} text-left`}>Classe</th>
            <th className={`${TABLE_STYLES.compact.th} text-right`}>Qtd. Atual</th>
            <th className={`${TABLE_STYLES.compact.th} text-right`}>P. Médio atual</th>
            <th className={`${TABLE_STYLES.compact.th} text-right`}>YoC</th>
            <th className={`${TABLE_STYLES.compact.th} text-right`}>Dividend Yield</th>
            <th className={`${TABLE_STYLES.compact.th} text-right`}>Últ. Provento</th>
            <th
              className={`${TABLE_STYLES.compact.th} cursor-pointer select-none text-right`}
              onClick={() => toggleSort('total')}
            >
              Total Acumulado {sortKey === 'total' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className={`${TABLE_STYLES.compact.th} text-right`}>Magic number</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, data]) => {
            const symbol = data.items[0]?.symbol ?? '';
            const isFii = data.classe === "FII's";

            return (
              <tr key={name} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                <td
                  className={`${TABLE_STYLES.compact.td} font-medium text-gray-900 dark:text-white`}
                >
                  <div className="flex flex-col">
                    <span>{symbol || name}</span>
                    {symbol && symbol !== name ? (
                      <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                        {name}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={TABLE_STYLES.compact.td}>
                  {data.classe ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium uppercase">
                      {data.classe}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {data.quantidadeAtual != null ? formatNumber(data.quantidadeAtual) : '—'}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {data.precoMedio != null ? formatCurrency(data.precoMedio) : '—'}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {data.yoc != null ? formatPercent(data.yoc) : '—'}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {data.dividendYield != null ? formatPercent(data.dividendYield) : '—'}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {data.ultimoProvento != null ? formatCurrency(data.ultimoProvento) : '—'}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right font-medium`}>
                  {formatCurrency(data.total)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {isFii && data.magicNumber ? formatNumber(data.magicNumber) : '—'}
                </td>
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr className={TABLE_STYLES.placeholderRow}>
              <td
                colSpan={9}
                className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                Nenhum provento encontrado no período selecionado
              </td>
            </tr>
          )}
        </tbody>
        {entries.length > 0 && (
          <tfoot>
            <tr className={TABLE_STYLES.totalRow}>
              <td colSpan={7} className={`${TABLE_STYLES.compact.td} font-semibold`}>
                Total
              </td>
              <td className={`${TABLE_STYLES.compact.td} text-right font-semibold`}>
                {formatCurrency(total)}
              </td>
              <td className={TABLE_STYLES.compact.td} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
