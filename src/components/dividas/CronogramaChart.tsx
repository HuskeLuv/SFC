'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useTheme } from '@/context/ThemeContext';
import type { ParcelaCronograma } from '@/hooks/useDividas';
import { formatBRLCompact, formatYearMonth } from './utils';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface CronogramaChartProps {
  cronograma: ParcelaCronograma[];
  parcelasPagas: number;
}

// Paleta alinhada ao app (brand + dourado), legível em claro/escuro.
const COLOR_AMORT = '#465FFF'; // brand-500 — amortização
const COLOR_JUROS = '#B8935A'; // dourado — juros
const COLOR_SALDO = '#1A56A0'; // azul — saldo devedor

/** Amostra o cronograma pra no máx. `max` pontos (prazos longos legíveis). */
function sample(rows: ParcelaCronograma[], max: number): ParcelaCronograma[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  const out = rows.filter((_, i) => i % step === 0);
  if (out[out.length - 1]?.numero !== rows[rows.length - 1].numero) {
    out.push(rows[rows.length - 1]);
  }
  return out;
}

/**
 * Composição da parcela mês a mês: barras empilhadas (amortização + juros)
 * com a linha do saldo devedor no eixo secundário. É a visualização clássica
 * da diferença SAC × Price.
 */
export default function CronogramaChart({ cronograma, parcelasPagas }: CronogramaChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const rows = useMemo(() => sample(cronograma, 60), [cronograma]);

  // Contratos indexados chegam com *Corrigido (índice realizado) — plota o
  // corrigido quando presente.
  const series = useMemo(
    () => [
      {
        name: 'Amortização',
        type: 'column' as const,
        data: rows.map((r) => ({ x: r.mes, y: r.amortizacaoCorrigida ?? r.amortizacao })),
      },
      {
        name: 'Juros',
        type: 'column' as const,
        data: rows.map((r) => ({ x: r.mes, y: r.jurosCorrigido ?? r.juros })),
      },
      {
        name: 'Saldo devedor',
        type: 'line' as const,
        data: rows.map((r) => ({ x: r.mes, y: r.saldoDevedorCorrigido ?? r.saldoDevedor })),
      },
    ],
    [rows],
  );

  const options: ApexOptions = useMemo(() => {
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const pagoAte = parcelasPagas > 0 ? cronograma[parcelasPagas - 1]?.mes : null;
    return {
      chart: {
        id: 'divida-cronograma',
        fontFamily: 'Outfit, sans-serif',
        stacked: true,
        toolbar: { show: false },
        zoom: { enabled: false },
        background: 'transparent',
      },
      colors: [COLOR_AMORT, COLOR_JUROS, COLOR_SALDO],
      stroke: { width: [0, 0, 2], curve: 'smooth' },
      plotOptions: { bar: { columnWidth: '70%' } },
      dataLabels: { enabled: false },
      legend: { labels: { colors: textColor } },
      xaxis: {
        type: 'category',
        labels: {
          rotate: -45,
          style: { colors: textColor, fontSize: '10px' },
          formatter: (v: string) => formatYearMonth(v),
        },
        tickAmount: 12,
      },
      yaxis: [
        {
          seriesName: 'Amortização',
          labels: {
            style: { colors: textColor },
            formatter: (v: number) => formatBRLCompact(v),
          },
          title: { text: 'Parcela', style: { color: textColor } },
        },
        { seriesName: 'Juros', show: false },
        {
          seriesName: 'Saldo devedor',
          opposite: true,
          labels: {
            style: { colors: textColor },
            formatter: (v: number) => formatBRLCompact(v),
          },
          title: { text: 'Saldo devedor', style: { color: textColor } },
        },
      ],
      tooltip: {
        theme: isDark ? 'dark' : 'light',
        y: { formatter: (v: number) => formatBRLCompact(v) },
      },
      annotations: pagoAte
        ? {
            xaxis: [
              {
                x: pagoAte,
                borderColor: '#10b981',
                strokeDashArray: 4,
                label: {
                  text: 'Pago até aqui',
                  style: { color: '#fff', background: '#10b981', fontSize: '10px' },
                },
              },
            ],
          }
        : undefined,
      grid: { borderColor: isDark ? '#1f2937' : '#e5e7eb' },
    };
  }, [isDark, cronograma, parcelasPagas]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white/90">
        Composição das parcelas
      </h3>
      <ReactApexChart options={options} series={series} type="line" height={320} />
    </div>
  );
}
