'use client';

import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import ApexChartWrapper from '@/components/charts/ApexChartWrapper';
import { useTheme } from '@/context/ThemeContext';
import { formatBRL } from '@/utils/format';
import type { OrcamentoLinha } from './OrcamentoTable';

/**
 * Donut de distribuição por categoria, espelhando o gráfico de rosca da
 * planilha modelo (total no centro). Toggle Real (padrão) × Orçado; fatias
 * em R$ da janela selecionada (mês ou acumulado).
 *
 * Cores POR NOME de categoria, extraídas do próprio donut da planilha
 * (xl/charts/chart1.xml — cada fatia tem cor explícita); categorias que não
 * existem no modelo caem nos accents do tema da mesma planilha. Mapear por
 * nome mantém a cor da categoria estável ao alternar Real/Orçado.
 */

const CORES_PLANILHA: Record<string, string> = {
  Habitação: '#9E8A58',
  Transporte: '#61D836',
  Saúde: '#929292',
  'Despesas Pessoais': '#4472C4',
  Lazer: '#FFC000',
  'Despesas Financeiras': '#E6E0D2',
  Agradecimentos: '#404040',
  'Despesas Empresa': '#E6E0D2',
  'Planejamento Financeiro': '#685B3A',
};

// Accents do tema da planilha (theme1.xml), para categorias fora do modelo.
const CORES_FALLBACK = ['#00A2FF', '#16E7CF', '#FFD932', '#FF644E', '#FF42A1', '#5E5E5E'];

type Serie = 'orcado' | 'real';

interface OrcamentoChartProps {
  linhas: OrcamentoLinha[];
}

export default function OrcamentoChart({ linhas }: OrcamentoChartProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [serie, setSerie] = useState<Serie>('real');

  const { labels, valores, total, cores } = useMemo(() => {
    const fatias = linhas
      .map((l) => ({
        nome: l.nome,
        valor: serie === 'orcado' ? (l.metaJanela ?? 0) : l.real,
      }))
      .filter((f) => f.valor > 0);
    let fallbackIdx = 0;
    const coresFatias = fatias.map(
      (f) => CORES_PLANILHA[f.nome] ?? CORES_FALLBACK[fallbackIdx++ % CORES_FALLBACK.length],
    );
    return {
      labels: fatias.map((f) => f.nome),
      valores: fatias.map((f) => f.valor),
      total: fatias.reduce((sum, f) => sum + f.valor, 0),
      cores: coresFatias,
    };
  }, [linhas, serie]);

  const options: ApexOptions = useMemo(
    () => ({
      colors: cores,
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
    [labels, cores, total, serie, isDarkMode],
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
            className={toggleClass(serie === 'real')}
            onClick={() => setSerie('real')}
          >
            Real
          </button>
          <button
            type="button"
            className={toggleClass(serie === 'orcado')}
            onClick={() => setSerie('orcado')}
          >
            Orçado
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
