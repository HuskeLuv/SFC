'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { formatBRL, formatBRLCompact } from '../utils';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface EvolucaoPatrimonioChartProps {
  categories: string[];
  planejado: number[];
  realizado: (number | null)[];
  revisado: (number | null)[];
  retIndex: number; // offset da aposentadoria (anotação)
  hojeIndex: number; // offset do último registro (anotação "Hoje")
}

const COLOR_PLAN = '#465FFF';
const COLOR_REAL = '#B8935A';
const COLOR_REV = '#2B7AC8';

/**
 * Patrimônio: Planejado (área) vs Realizado (linha c/ marcadores) vs Projeção
 * revisada (tracejada). Zoom/pan via toolbar nativa do ApexCharts (em vez do
 * scroll/arraste sob medida do protótipo, pra manter consistência com o app).
 */
export default function EvolucaoPatrimonioChart({
  categories,
  planejado,
  realizado,
  revisado,
  retIndex,
  hojeIndex,
}: EvolucaoPatrimonioChartProps) {
  const series = useMemo(
    () => [
      { name: 'Planejado', type: 'area', data: planejado.map((v) => Math.round(v)) },
      {
        name: 'Realizado',
        type: 'line',
        data: realizado.map((v) => (v == null ? null : Math.round(v))),
      },
      {
        name: 'Revisado',
        type: 'line',
        data: revisado.map((v) => (v == null ? null : Math.round(v))),
      },
    ],
    [planejado, realizado, revisado],
  );

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        id: 'apos-evol-patrimonio',
        fontFamily: 'Outfit, sans-serif',
        type: 'line',
        zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
        toolbar: {
          show: true,
          tools: {
            zoom: true,
            zoomin: true,
            zoomout: true,
            reset: true,
            pan: true,
            download: false,
            selection: false,
          },
        },
      },
      colors: [COLOR_PLAN, COLOR_REAL, COLOR_REV],
      stroke: { curve: 'smooth', width: [2, 3, 2], dashArray: [0, 0, 6] },
      fill: {
        type: ['gradient', 'solid', 'solid'],
        gradient: { opacityFrom: 0.35, opacityTo: 0.05 },
        opacity: [0.35, 1, 1],
      },
      markers: { size: [0, 4, 0], hover: { size: 6 } },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'top', horizontalAlign: 'left', fontSize: '12px' },
      xaxis: {
        categories,
        labels: {
          style: { colors: '#64748B', fontSize: '11px' },
          hideOverlappingLabels: true,
          rotate: -45,
        },
        tickAmount: Math.min(12, categories.length),
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
      annotations: {
        xaxis: [
          ...(retIndex >= 0 && retIndex < categories.length
            ? [
                {
                  x: categories[retIndex],
                  borderColor: COLOR_PLAN,
                  strokeDashArray: 4,
                  label: {
                    text: 'Aposentadoria',
                    style: { color: '#fff', background: COLOR_PLAN, fontSize: '10px' },
                  },
                },
              ]
            : []),
          ...(hojeIndex > 0 && hojeIndex < categories.length
            ? [
                {
                  x: categories[hojeIndex],
                  borderColor: '#94A3B8',
                  strokeDashArray: 3,
                  label: {
                    text: 'Hoje',
                    style: { color: '#fff', background: '#94A3B8', fontSize: '10px' },
                  },
                },
              ]
            : []),
        ],
      },
    }),
    [categories, retIndex, hojeIndex],
  );

  return (
    <div className="w-full">
      <ReactApexChart options={options} series={series} type="line" height={320} />
    </div>
  );
}
