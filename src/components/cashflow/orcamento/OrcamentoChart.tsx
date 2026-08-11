'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { formatBRL } from '@/utils/format';
import type { OrcamentoLinha } from './OrcamentoTable';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const COLOR_ORCADO = '#94A3B8'; // slate-400, mesmo "planejado" dos outros charts
const COLOR_REAL = '#465FFF'; // brand-500

interface OrcamentoChartProps {
  linhas: OrcamentoLinha[];
}

/**
 * Barras agrupadas Orçado × Real por categoria, na janela selecionada
 * (mês ou acumulado). Só entra categoria com meta definida ou movimento —
 * categoria zerada não polui o gráfico.
 */
export default function OrcamentoChart({ linhas }: OrcamentoChartProps) {
  const visiveis = useMemo(
    () => linhas.filter((l) => l.metaJanela !== null || l.real !== 0),
    [linhas],
  );

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        id: 'orcamento-vs-real',
        fontFamily: 'Outfit, sans-serif',
        toolbar: { show: false },
        zoom: { enabled: false },
        type: 'bar',
      },
      colors: [COLOR_ORCADO, COLOR_REAL],
      plotOptions: {
        bar: { columnWidth: '55%', borderRadius: 3 },
      },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'top', horizontalAlign: 'left' },
      xaxis: {
        categories: visiveis.map((l) => l.nome),
        labels: {
          rotate: -45,
          style: { colors: '#64748B', fontSize: '11px' },
          hideOverlappingLabels: false,
          trim: true,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: '#64748B', fontSize: '11px' },
          formatter: (val: number) => formatBRL(val),
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (val: number) => (val == null ? '—' : formatBRL(val)) },
      },
      grid: { borderColor: '#E5E7EB', strokeDashArray: 3 },
    }),
    [visiveis],
  );

  const series = useMemo(
    () => [
      { name: 'Orçado', data: visiveis.map((l) => l.metaJanela ?? 0) },
      { name: 'Real', data: visiveis.map((l) => l.real) },
    ],
    [visiveis],
  );

  if (visiveis.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 px-4 pt-3 dark:border-gray-800">
      <ReactApexChart options={options} series={series} type="bar" height={300} />
    </div>
  );
}
