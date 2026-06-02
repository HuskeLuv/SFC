'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { fPct } from '../utils';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface EvolucaoRentChartProps {
  categories: string[];
  rent: number[]; // % ao mês realizada
  meta: number; // % ao mês necessária
}

const COLOR_OK = '#3B6D11';
const COLOR_BAD = '#8B1A1A';

/**
 * Rentabilidade mensal realizada vs meta. Barras verdes acima da meta,
 * vermelhas abaixo (via ranges), com linha de meta anotada.
 */
export default function EvolucaoRentChart({ categories, rent, meta }: EvolucaoRentChartProps) {
  const series = useMemo(
    () => [{ name: 'Rentabilidade', data: rent.map((v) => Number(v.toFixed(3))) }],
    [rent],
  );

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        id: 'apos-evol-rent',
        fontFamily: 'Outfit, sans-serif',
        type: 'bar',
        toolbar: { show: false },
      },
      plotOptions: {
        bar: {
          columnWidth: '55%',
          borderRadius: 3,
          colors: {
            ranges: [
              { from: -100, to: meta - 1e-9, color: COLOR_BAD },
              { from: meta, to: 100, color: COLOR_OK },
            ],
          },
        },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
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
        labels: { style: { colors: '#64748B', fontSize: '11px' }, formatter: (v) => fPct(v, 2) },
      },
      tooltip: { y: { formatter: (v) => (v == null ? '—' : fPct(v, 3)) } },
      grid: { borderColor: '#E5E7EB', strokeDashArray: 3 },
      annotations: {
        yaxis: [
          {
            y: meta,
            borderColor: '#B8935A',
            strokeDashArray: 6,
            label: {
              text: `Meta ${fPct(meta, 3)}`,
              style: { color: '#fff', background: '#B8935A', fontSize: '10px' },
              position: 'right',
            },
          },
        ],
      },
    }),
    [categories, meta],
  );

  return (
    <div className="w-full">
      <ReactApexChart options={options} series={series} type="bar" height={260} />
    </div>
  );
}
