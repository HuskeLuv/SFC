'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { addMonths, planned } from '@/services/planejamento/planejamentoSonhos';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import { formatBRL, formatBRLCompact, formatYearMonth, categoryAccent } from './utils';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface SonhosObjetivoEvolutionChartProps {
  objetivo: PlanejamentoObjetivoDTO;
}

/**
 * Gráfico de linha: trajetória planejada vs realizada + linha de meta.
 *
 * - Eixo X usa rótulos YYYY-MM (categorias) derivados de `startDate` ou
 *   fallback pra "M0..Mn" quando o objetivo não tem startDate definido.
 * - Série "Realizado" tem buracos (null) nos meses sem entry — ApexCharts
 *   junta automaticamente com `connectNulls`. Desligamos pra deixar visível
 *   onde paramos de registrar.
 */
export default function SonhosObjetivoEvolutionChart({
  objetivo,
}: SonhosObjetivoEvolutionChartProps) {
  const accent = categoryAccent(objetivo.category);

  const { categories, plannedSeries, actualSeries } = useMemo(() => {
    const n = objetivo.months;
    const cats: string[] = [];
    const plan: number[] = [];
    // null porque ApexCharts pula valores nulos sem ligar pontos vizinhos.
    const act: (number | null)[] = new Array(n + 1).fill(null);

    // Categorias: se temos startDate, viramos "Mai/26"; senão, "M0..Mn".
    for (let i = 0; i <= n; i++) {
      cats.push(objetivo.startDate ? formatYearMonth(addMonths(objetivo.startDate, i)) : `M${i}`);
      plan.push(Number(planned(objetivo, i).toFixed(2)));
    }

    // Ponto inicial = available; entries preenchem o restante.
    act[0] = objetivo.available;
    objetivo.entries.forEach((e) => {
      // Posição do entry: diff em meses entre e.month e startDate (se houver).
      // Sem startDate, usamos a ordem cronológica dos entries.
      if (objetivo.startDate) {
        const [sy, sm] = objetivo.startDate.split('-').map(Number);
        const [ey, em] = e.month.split('-').map(Number);
        const idx = (ey - sy) * 12 + (em - sm);
        if (idx >= 0 && idx <= n) act[idx] = e.balance;
      }
    });

    if (!objetivo.startDate) {
      // Sem startDate, alocamos entries em sequência a partir de M1.
      objetivo.entries.forEach((e, i) => {
        const idx = i + 1;
        if (idx <= n) act[idx] = e.balance;
      });
    }

    return { categories: cats, plannedSeries: plan, actualSeries: act };
  }, [objetivo]);

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        id: `sonhos-${objetivo.id}`,
        fontFamily: 'Outfit, sans-serif',
        toolbar: { show: false },
        zoom: { enabled: false },
        type: 'line',
      },
      colors: ['#94A3B8', accent],
      stroke: {
        curve: 'smooth',
        width: [2, 3],
        dashArray: [4, 0],
      },
      markers: {
        size: [0, 4],
        hover: { size: 6 },
      },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories,
        labels: {
          rotate: -45,
          style: { colors: '#64748B', fontSize: '11px' },
          // Limitar densidade de labels no eixo X pra objetivos longos.
          hideOverlappingLabels: true,
        },
        tickAmount: Math.min(12, objetivo.months),
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: '#64748B', fontSize: '11px' },
          formatter: (val: number) => formatBRLCompact(val),
        },
      },
      annotations: {
        yaxis: [
          {
            y: objetivo.target,
            borderColor: '#EF4444',
            strokeDashArray: 6,
            label: {
              text: `Meta · ${formatBRL(objetivo.target)}`,
              borderColor: '#EF4444',
              style: { color: '#fff', background: '#EF4444', fontSize: '10px' },
              position: 'right',
            },
          },
        ],
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (val: number) => (val == null ? '—' : formatBRL(val)) },
      },
      grid: {
        borderColor: '#E5E7EB',
        strokeDashArray: 3,
      },
    }),
    [objetivo.id, objetivo.target, objetivo.months, accent, categories],
  );

  const series = useMemo(
    () => [
      { name: 'Planejado', data: plannedSeries },
      { name: 'Realizado', data: actualSeries },
    ],
    [plannedSeries, actualSeries],
  );

  return (
    <div className="w-full">
      <ReactApexChart options={options} series={series} type="line" height={320} />
    </div>
  );
}
