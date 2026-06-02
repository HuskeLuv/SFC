'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { formatBRL, formatBRLCompact } from '../utils';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface EvolucaoAportesChartProps {
  categories: string[];
  projetado: number[];
  realizado: number[];
}

const COLOR_PROJ = '#94A3B8';
const COLOR_REAL = '#465FFF';

/** Aportes: barras agrupadas Projetado vs Realizado por mês registrado. */
export default function EvolucaoAportesChart({
  categories,
  projetado,
  realizado,
}: EvolucaoAportesChartProps) {
  const series = useMemo(
    () => [
      { name: 'Projetado', data: projetado.map((v) => Math.round(v)) },
      { name: 'Realizado', data: realizado.map((v) => Math.round(v)) },
    ],
    [projetado, realizado],
  );

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        id: 'apos-evol-aportes',
        fontFamily: 'Outfit, sans-serif',
        type: 'bar',
        toolbar: { show: false },
      },
      colors: [COLOR_PROJ, COLOR_REAL],
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 3 } },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'top', horizontalAlign: 'left', fontSize: '12px' },
      xaxis: {
        categories,
        labels: {
          style: { colors: '#64748B', fontSize: '11px' },
          rotate: -45,
          hideOverlappingLabels: true,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: '#64748B', fontSize: '11px' },
          formatter: (v) => formatBRLCompact(v),
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (v) => (v == null ? '—' : formatBRL(v)) },
      },
      grid: { borderColor: '#E5E7EB', strokeDashArray: 3 },
    }),
    [categories],
  );

  return (
    <div className="w-full">
      <ReactApexChart options={options} series={series} type="bar" height={260} />
    </div>
  );
}
