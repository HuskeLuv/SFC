'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import type { ProjecaoResult } from '@/services/planejamento/aposentadoria';
import { formatBRLCompact } from '../utils';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface ProjecaoChartProps {
  data: ProjecaoResult;
  apos: number;
  vida: number;
}

// Paleta alinhada ao app (brand + tons neutros), legível em claro/escuro.
const COLOR_ACUM = '#465FFF'; // brand-500
const COLOR_DES = '#1A56A0'; // azul renda desejada
const COLOR_PRES = '#B8935A'; // dourado preservando
const COLOR_CONS = '#9A9488'; // neutro consumindo

/**
 * Gráfico da projeção em termos reais (R$ de hoje):
 *  - área de acumulação até a aposentadoria
 *  - 3 linhas pós-aposentadoria: renda desejada (sólida), preservando e
 *    consumindo (tracejadas)
 *  - anotações de aposentadoria/expectativa e marcador de "acaba aos X anos"
 */
export default function ProjecaoChart({ data, apos, vida }: ProjecaoChartProps) {
  const series = useMemo(() => {
    const acum = data.accAges.map((a, i) => ({ x: a, y: Math.round(data.accVals[i]) }));
    const des = data.postAges.map((a, i) => ({ x: a, y: Math.round(data.desVals[i]) }));
    const pres = data.postAges.map((a, i) => ({ x: a, y: Math.round(data.presVals[i]) }));
    const cons = data.postAges.map((a, i) => ({ x: a, y: Math.round(data.consVals[i]) }));
    return [
      { name: 'Acumulação', type: 'area', data: acum },
      { name: 'Renda desejada', type: 'line', data: des },
      { name: 'Preservando', type: 'line', data: pres },
      { name: 'Consumindo', type: 'line', data: cons },
    ];
  }, [data]);

  const options: ApexOptions = useMemo(() => {
    const points: ApexOptions['annotations'] = { xaxis: [], points: [] };
    points.xaxis = [
      {
        x: apos,
        borderColor: COLOR_PRES,
        strokeDashArray: 4,
        label: {
          text: `Apos. ${apos}`,
          style: { color: '#fff', background: COLOR_PRES, fontSize: '10px' },
        },
      },
      {
        x: vida,
        borderColor: '#9A9488',
        strokeDashArray: 3,
        label: {
          text: `Exp. ${vida}`,
          style: { color: '#fff', background: '#9A9488', fontSize: '10px' },
        },
      },
    ];
    if (
      Number.isFinite(data.idadeAcaba) &&
      data.idadeAcaba > apos &&
      data.idadeAcaba <= vida + 20
    ) {
      points.points = [
        {
          x: Math.round(data.idadeAcaba),
          y: 0,
          marker: { size: 5, fillColor: '#DC2626', strokeColor: '#fff' },
          label: {
            text: `Acaba aos ${data.idadeAcaba.toFixed(0)}`,
            style: { color: '#fff', background: '#DC2626', fontSize: '10px' },
          },
        },
      ];
    }

    return {
      chart: {
        id: 'apos-projecao',
        fontFamily: 'Outfit, sans-serif',
        toolbar: { show: false },
        zoom: { enabled: false },
        type: 'line',
      },
      colors: [COLOR_ACUM, COLOR_DES, COLOR_PRES, COLOR_CONS],
      stroke: { curve: 'smooth', width: [2, 3, 2.5, 2.5], dashArray: [0, 0, 6, 6] },
      fill: {
        type: ['gradient', 'solid', 'solid', 'solid'],
        gradient: { shadeIntensity: 0.4, opacityFrom: 0.4, opacityTo: 0.05 },
        opacity: [0.4, 1, 1, 1],
      },
      markers: { size: 0, hover: { size: 4 } },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'top', horizontalAlign: 'left', fontSize: '12px' },
      xaxis: {
        type: 'numeric',
        title: { text: 'Idade', style: { color: '#9A9488', fontSize: '11px' } },
        labels: {
          style: { colors: '#64748B', fontSize: '11px' },
          formatter: (v) => `${Math.round(Number(v))}`,
        },
        tickAmount: 8,
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
        x: { formatter: (v) => `Idade ${Math.round(Number(v))} anos` },
        y: { formatter: (v) => (v == null ? '—' : formatBRLCompact(v)) },
      },
      grid: { borderColor: '#E5E7EB', strokeDashArray: 3 },
      annotations: points,
    };
  }, [data, apos, vida]);

  return (
    <div className="w-full">
      <ReactApexChart options={options} series={series} type="line" height={320} />
    </div>
  );
}
