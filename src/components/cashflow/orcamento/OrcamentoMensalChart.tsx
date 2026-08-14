'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useTheme } from '@/context/ThemeContext';
import { MONTHS } from '@/constants/cashflow';
import { formatBRL } from '@/utils/format';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

/**
 * Barras agrupadas Orçado × Real mês a mês (Jan–Dez), espelhando o gráfico
 * "Orçamento vs. Atual" da planilha modelo (chart2.xml): Orçamento dourado
 * #9E8A58 e Real na cor de texto — preto no claro, claro no escuro.
 * O Orçado mensal é a soma das metas das categorias (constante no ano);
 * o Real segue o modo selecionado na seção (lançado/consolidado).
 */

const COLOR_ORCADO = '#9E8A58';

interface OrcamentoMensalChartProps {
  /** Soma das metas mensais das categorias (sem investimentos). */
  orcadoMensal: number;
  /** Real por mês (12 posições), já no modo de leitura selecionado. */
  realPorMes: number[];
}

export default function OrcamentoMensalChart({
  orcadoMensal,
  realPorMes,
}: OrcamentoMensalChartProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const colorReal = isDarkMode ? '#E5E7EB' : '#1D2939';

  const options: ApexOptions = useMemo(
    () => ({
      colors: [COLOR_ORCADO, colorReal],
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'bar',
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 2 } },
      dataLabels: { enabled: false },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        labels: { colors: isDarkMode ? '#ffffff' : '#000000' },
        markers: { width: 8, height: 8, strokeWidth: 0, radius: 12 },
      },
      xaxis: {
        categories: [...MONTHS],
        labels: { style: { colors: '#64748B', fontSize: '11px' } },
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
      grid: { borderColor: isDarkMode ? '#374151' : '#E5E7EB', strokeDashArray: 3 },
    }),
    [colorReal, isDarkMode],
  );

  const series = useMemo(
    () => [
      { name: 'Orçado', data: Array(12).fill(Math.round(orcadoMensal * 100) / 100) },
      { name: 'Real', data: realPorMes.slice(0, 12) },
    ],
    [orcadoMensal, realPorMes],
  );

  if (orcadoMensal <= 0 && realPorMes.every((v) => v === 0)) return null;

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      {/* Nome do gráfico homônimo da planilha-base */}
      <h4 className="mb-2 text-sm font-medium text-gray-800 dark:text-white/90">
        Orçamento vs. Atual
      </h4>
      <ReactApexChart options={options} series={series} type="bar" height={280} />
    </div>
  );
}
