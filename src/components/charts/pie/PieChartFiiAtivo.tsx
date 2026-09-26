'use client';
import React, { useMemo } from 'react';
import { ApexOptions } from 'apexcharts';
import { FiiAlocacaoAtivo } from '@/types/fii';

import dynamic from 'next/dynamic';
// Dynamically import the ReactApexChart component
const ReactApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
});

interface PieChartFiiAtivoProps {
  data: FiiAlocacaoAtivo[];
  isDarkMode?: boolean;
}

const PieChartFiiAtivo: React.FC<PieChartFiiAtivoProps> = ({ data, isDarkMode = false }) => {
  const options: ApexOptions = useMemo(
    () => ({
      colors: data.map((item) => item.cor),
      labels: data.map((item) => item.ticker),
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'donut',
        width: '100%',
        height: 300,
      },
      stroke: {
        show: false,
        width: 4,
        colors: ['transparent'],
      },
      plotOptions: {
        pie: {
          donut: {
            size: '65%',
            background: 'transparent',
            labels: {
              show: true,
              name: {
                show: true,
                offsetY: -10,
                color: isDarkMode ? '#ffffff' : '#1D2939',
                fontSize: '14px',
                fontWeight: '500',
              },
              value: {
                show: true,
                offsetY: 10,
                color: isDarkMode ? '#D1D5DB' : '#667085',
                fontSize: '12px',
                fontWeight: '400',
                // Bug #06: mesmo cuidado de PieChartFiiSegmento — formatamos
                // o valor em BRL pra esconder o ruído de ponto flutuante.
                formatter: (val: string) =>
                  `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              },
              total: {
                show: true,
                label: 'Total FIIs',
                color: isDarkMode ? '#ffffff' : '#000000',
                fontSize: '16px',
                fontWeight: 'bold',
                formatter: (w: { globals: { seriesTotals: number[] } }) => {
                  const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                  return `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                },
              },
            },
          },
          expandOnClick: false,
        },
      },
      dataLabels: {
        enabled: false,
      },
      tooltip: {
        enabled: true,
        y: {
          formatter: (val: number) =>
            `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        },
      },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        fontFamily: 'Outfit',
        fontSize: '10px',
        fontWeight: 400,
        markers: {
          size: 3,
          shape: 'circle',
          strokeWidth: 0,
        },
        itemMargin: {
          horizontal: 8,
          vertical: 0,
        },
        labels: {
          colors: isDarkMode ? '#D1D5DB' : '#667085',
        },
      },
      states: {
        hover: {
          filter: {
            type: 'none',
          },
        },
        active: {
          allowMultipleDataPointsSelection: false,
          filter: {
            type: 'darken',
          },
        },
      },
      responsive: [
        {
          // PWA fase 1: abaixo de lg (o Apex só aplica abaixo de 1024px — o desktop não muda),
          // legenda embaixo e legível, sem rótulos em cima das fatias.
          breakpoint: 1023,
          options: {
            chart: { height: 340 },
            legend: {
              position: 'bottom',
              fontSize: '12px',
              markers: { size: 5 },
              itemMargin: { horizontal: 8, vertical: 4 },
            },
            dataLabels: { enabled: false },
          },
        },
        {
          breakpoint: 640,
          options: {
            chart: {
              width: '100%',
              height: 320,
            },
            legend: {
              fontSize: '12px',
              markers: {
                size: 5,
              },
            },
          },
        },
      ],
    }),
    [data, isDarkMode],
  );

  const series = data.map((item) => item.valor);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-2">
            <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded"></div>
          </div>
          <p className="text-sm">Nenhum dado disponível</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div id="chartFiiAtivo" className="w-full">
        <ReactApexChart options={options} series={series} type="donut" height={300} />
      </div>
    </div>
  );
};

export default PieChartFiiAtivo;
