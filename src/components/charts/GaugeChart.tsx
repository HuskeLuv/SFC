'use client';
import React, { useMemo } from 'react';
import { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface GaugeChartProps {
  /** Valor percentual (0-100) para preencher o gauge */
  value: number;
  /** Cor do segmento preenchido */
  color?: string;
  /** Cor da trilha (fundo) */
  trackColor?: string;
  /** Altura do gráfico em pixels */
  height?: number;
  /** PWA fase 1: altura abaixo de lg (padrão: `height`). */
  mobileHeight?: number;
  /** PWA fase 1: resumo para leitor de tela abaixo de lg (vira role=img). */
  ariaLabel?: string;
}

export default function GaugeChart({
  value,
  color = '#465FFF',
  trackColor = '#E4E7EC',
  height: desktopHeight = 250,
  mobileHeight,
  ariaLabel,
}: GaugeChartProps) {
  const isBelowLg = useIsBelowLg();
  const height = isBelowLg && mobileHeight !== undefined ? mobileHeight : desktopHeight;
  const series = [Math.max(0, Math.min(100, value))];

  const options: ApexOptions = useMemo(
    () => ({
      colors: [color],
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'radialBar',
        height,
        sparkline: { enabled: true },
      },
      plotOptions: {
        radialBar: {
          startAngle: -90,
          endAngle: 90,
          hollow: { size: '65%' },
          track: {
            background: trackColor,
            strokeWidth: '100%',
            margin: 5,
          },
          dataLabels: {
            name: { show: false },
            value: { show: false },
          },
        },
      },
      fill: {
        type: 'solid',
        colors: [color],
      },
      stroke: {
        lineCap: 'round',
      },
      labels: ['Sharpe'],
    }),
    [color, trackColor, height],
  );

  const chart = (
    <ReactApexChart options={options} series={series} type="radialBar" height={height} />
  );
  if (isBelowLg && ariaLabel) {
    return (
      <div role="img" aria-label={ariaLabel}>
        {chart}
      </div>
    );
  }
  return chart;
}
