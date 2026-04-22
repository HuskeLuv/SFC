import React, { useMemo, useState } from 'react';
import { GroupedProventoData } from '@/hooks/useProventos';

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

  if (groupBy !== 'ativo') {
    // Layout simples para agrupamentos por classe / tipo
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                {groupBy === 'classe' ? 'Classe' : 'Tipo'}
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                Total Acumulado
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, data]) => {
              const percentage = total > 0 ? (data.total / total) * 100 : 0;
              return (
                <tr
                  key={name}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{name}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                    {formatCurrency(data.total)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                    {percentage.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th
              className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              onClick={() => toggleSort('ativo')}
            >
              Ativo {sortKey === 'ativo' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
              Classe
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              Qtd. Atual
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              P. Médio atual
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              YoC
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              Dividend Yield
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              Últ. Provento
            </th>
            <th
              className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              onClick={() => toggleSort('total')}
            >
              Total Acumulado {sortKey === 'total' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              Magic number
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, data]) => {
            const symbol = data.items[0]?.symbol ?? '';
            const isFii = data.classe === "FII's";

            return (
              <tr
                key={name}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                  <div className="flex flex-col">
                    <span>{symbol || name}</span>
                    {symbol && symbol !== name ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{name}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {data.classe ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium uppercase">
                      {data.classe}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                  {data.quantidadeAtual != null ? formatNumber(data.quantidadeAtual) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                  {data.precoMedio != null ? formatCurrency(data.precoMedio) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                  {data.yoc != null ? formatPercent(data.yoc) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                  {data.dividendYield != null ? formatPercent(data.dividendYield) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                  {data.ultimoProvento != null ? formatCurrency(data.ultimoProvento) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                  {formatCurrency(data.total)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                  {isFii && data.magicNumber ? formatNumber(data.magicNumber) : '—'}
                </td>
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr>
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
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
              <td
                colSpan={7}
                className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white"
              >
                Total
              </td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">
                {formatCurrency(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
