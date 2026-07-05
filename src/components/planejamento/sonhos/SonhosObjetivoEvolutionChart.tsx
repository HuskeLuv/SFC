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
 * - Série "Realizado": linha CONTÍNUA e monotônica do início até o último mês
 *   realizado — carrega o saldo pra frente nos meses sem registro e fica `null`
 *   só depois do último realizado (futuro). Evita as "quedas aleatórias" que
 *   apareciam com pontos esparsos + curva spline (`smooth`).
 */
export default function SonhosObjetivoEvolutionChart({
  objetivo,
}: SonhosObjetivoEvolutionChartProps) {
  const accent = categoryAccent(objetivo.category);

  const { categories, plannedSeries, actualSeries, realizedIdxs } = useMemo(() => {
    const n = objetivo.months;
    const cats: string[] = [];
    const plan: number[] = [];

    // Categorias: se temos startDate, viramos "Mai/26"; senão, "M0..Mn".
    for (let i = 0; i <= n; i++) {
      cats.push(objetivo.startDate ? formatYearMonth(addMonths(objetivo.startDate, i)) : `M${i}`);
      plan.push(Number(planned(objetivo, i).toFixed(2)));
    }

    // Mapeia cada entry → índice de calendário (offset de meses desde startDate).
    // Sem startDate, usa a ordem cronológica dos entries a partir de M1.
    const balanceByIdx = new Map<number, number>();
    if (objetivo.startDate) {
      const [sy, sm] = objetivo.startDate.split('-').map(Number);
      objetivo.entries.forEach((e) => {
        const [ey, em] = e.month.split('-').map(Number);
        const idx = (ey - sy) * 12 + (em - sm);
        if (idx >= 0 && idx <= n) balanceByIdx.set(idx, e.balance);
      });
    } else {
      objetivo.entries.forEach((e, i) => {
        const idx = i + 1;
        if (idx <= n) balanceByIdx.set(idx, e.balance);
      });
    }

    // Linha contínua até o último mês realizado: carrega o saldo conhecido pra
    // frente nos meses sem registro; `null` depois disso (ainda não realizado).
    const idxs = [...balanceByIdx.keys()].sort((a, b) => a - b);
    const lastIdx = idxs.length > 0 ? idxs[idxs.length - 1] : 0;
    const act: (number | null)[] = new Array(n + 1).fill(null);
    let running = objetivo.available;
    for (let i = 0; i <= lastIdx; i++) {
      if (balanceByIdx.has(i)) running = balanceByIdx.get(i)!;
      act[i] = Number(running.toFixed(2));
    }

    return { categories: cats, plannedSeries: plan, actualSeries: act, realizedIdxs: idxs };
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
        // Planejado: spline suave (curva convexa, sem dips). Realizado: reta —
        // evita overshoot de spline que criava "quedas" entre pontos.
        curve: ['smooth', 'straight'],
        width: [2, 3],
        dashArray: [4, 0],
      },
      markers: {
        // Sem marcadores genéricos; só os meses efetivamente realizados.
        size: 0,
        discrete: realizedIdxs.map((idx) => ({
          seriesIndex: 1,
          dataPointIndex: idx,
          fillColor: accent,
          strokeColor: '#fff',
          size: 4,
        })),
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
    [objetivo.id, objetivo.target, objetivo.months, accent, categories, realizedIdxs],
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
