'use client';

import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import ApexChartWrapper from '@/components/charts/ApexChartWrapper';
import { useTheme } from '@/context/ThemeContext';
import { formatBRL } from '@/utils/format';
import type { OrcamentoLinha } from './OrcamentoTable';

/**
 * Donut de distribuição por categoria, espelhando o gráfico "Orçamento" da
 * planilha modelo (rosca com total no centro). Toggle Orçado (padrão, como o
 * modelo) × Real; fatias em R$ da janela selecionada (mês ou acumulado).
 * Paleta na família do tema clássico do Excel — mesma linguagem visual da
 * planilha e do PieChartCarteiraInvestimentos.
 */

const PALETTE = [
  '#4F81BD',
  '#C0504D',
  '#9BBB59',
  '#8064A2',
  '#4BACC6',
  '#F79646',
  '#FFC000',
  '#7030A0',
  '#9E8A58',
  '#64748B',
  '#E46C0A',
  '#00CCFF',
];

type Serie = 'orcado' | 'real';

interface OrcamentoChartProps {
  linhas: OrcamentoLinha[];
}

export default function OrcamentoChart({ linhas }: OrcamentoChartProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [serie, setSerie] = useState<Serie>('orcado');

  const { labels, valores, total } = useMemo(() => {
    const fatias = linhas
      .map((l) => ({
        nome: l.nome,
        valor: serie === 'orcado' ? (l.metaJanela ?? 0) : l.real,
      }))
      .filter((f) => f.valor > 0);
    return {
      labels: fatias.map((f) => f.nome),
      valores: fatias.map((f) => f.valor),
      total: fatias.reduce((sum, f) => sum + f.valor, 0),
    };
  }, [linhas, serie]);

  const options: ApexOptions = useMemo(
    () => ({
      colors: PALETTE,
      labels,
      chart: { fontFamily: 'Outfit, sans-serif', type: 'donut' },
      stroke: { show: false },
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            background: 'transparent',
            labels: {
              show: true,
              name: {
                show: true,
                offsetY: -10,
                color: isDarkMode ? '#ffffff' : '#1D2939',
                fontSize: '13px',
                fontWeight: '500',
              },
              value: {
                show: true,
                offsetY: 10,
                color: isDarkMode ? '#D1D5DB' : '#667085',
                fontSize: '12px',
                formatter: (val: string) => formatBRL(Number(val)),
              },
              total: {
                show: true,
                label: serie === 'orcado' ? 'Orçado' : 'Real',
                color: isDarkMode ? '#ffffff' : '#000000',
                fontSize: '15px',
                fontWeight: 'bold',
                formatter: () => formatBRL(total),
              },
            },
          },
          expandOnClick: false,
        },
      },
      dataLabels: { enabled: false },
      tooltip: {
        enabled: true,
        y: { formatter: (val: number) => formatBRL(val) },
      },
      legend: {
        show: true,
        position: 'bottom',
        fontFamily: 'Outfit, sans-serif',
        fontSize: '12px',
        labels: { colors: isDarkMode ? '#ffffff' : '#000000' },
        markers: { width: 8, height: 8, strokeWidth: 0, radius: 12 },
        itemMargin: { horizontal: 8, vertical: 2 },
      },
    }),
    [labels, total, serie, isDarkMode],
  );

  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition ${
      active
        ? 'bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-400'
        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-800 dark:text-white/90">
          Distribuição por categoria
        </h4>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            type="button"
            className={toggleClass(serie === 'orcado')}
            onClick={() => setSerie('orcado')}
          >
            Orçado
          </button>
          <button
            type="button"
            className={toggleClass(serie === 'real')}
            onClick={() => setSerie('real')}
          >
            Real
          </button>
        </div>
      </div>
      {valores.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          {serie === 'orcado' ? 'Nenhuma meta definida ainda.' : 'Sem despesas na janela.'}
        </div>
      ) : (
        <ApexChartWrapper
          options={options}
          series={valores}
          type="donut"
          width="100%"
          height="360"
        />
      )}
    </div>
  );
}
