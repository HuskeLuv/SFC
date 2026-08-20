'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useTheme } from '@/context/ThemeContext';
import { MONTHS } from '@/constants/cashflow';
import { formatBRL } from '@/utils/format';
import type { OrcamentoCategoria } from '@/services/cashflow/orcamentoVsReal';
import { coresPorNome } from './orcamentoCores';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

/**
 * Gráfico "Orçamento vs. Atual" — dois modos (ticket 20/08/2026, pedido do
 * Pedro):
 * - Visão MÊS: barras Orçado × Real POR CATEGORIA (Habitação, Saúde, …) do
 *   mês selecionado — antes mostrava o anual mesmo com o mês escolhido.
 * - Acumulado do ano: mensal Jan–Dez como antes, mas com a barra do Real
 *   EMPILHADA por categoria (formato do gráfico de proventos), ao lado da
 *   barra única do Orçado (grouped+stacked via `group` por série).
 *
 * Orçado dourado #9E8A58 (chart2.xml da planilha modelo); categorias nas
 * mesmas cores do donut (`orcamentoCores`); Real do modo Mês na cor de texto.
 */

const COLOR_ORCADO = '#9E8A58';

interface OrcamentoMensalChartProps {
  visao: 'mes' | 'ano';
  /** Mês selecionado (0-11) — usado só na visão 'mes'. */
  mes: number;
  modoReal: 'lancado' | 'consolidado';
  categorias: OrcamentoCategoria[];
  /** Soma das metas mensais das categorias (sem investimentos). */
  orcadoMensal: number;
}

export default function OrcamentoMensalChart({
  visao,
  mes,
  modoReal,
  categorias,
  orcadoMensal,
}: OrcamentoMensalChartProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const colorReal = isDarkMode ? '#E5E7EB' : '#1D2939';

  // Visão MÊS: uma coluna por categoria com meta ou gasto no mês.
  const porCategoria = useMemo(() => {
    if (visao !== 'mes') return null;
    const fatias = categorias
      .map((cat) => ({
        nome: cat.nome,
        orcado: cat.metaMensal ?? 0,
        real: Math.round((cat.realPorMes[modoReal][mes] || 0) * 100) / 100,
      }))
      .filter((f) => f.orcado > 0 || f.real > 0);
    return {
      nomes: fatias.map((f) => f.nome),
      orcado: fatias.map((f) => f.orcado),
      real: fatias.map((f) => f.real),
    };
  }, [visao, categorias, modoReal, mes]);

  // Acumulado: série mensal por categoria (empilhada) + Orçado ao lado.
  const anual = useMemo(() => {
    if (visao !== 'ano') return null;
    const comMovimento = categorias.filter((cat) => cat.realPorMes[modoReal].some((v) => v !== 0));
    return {
      nomes: comMovimento.map((c) => c.nome),
      series: comMovimento.map((c) => c.realPorMes[modoReal].slice(0, 12)),
    };
  }, [visao, categorias, modoReal]);

  const options: ApexOptions = useMemo(() => {
    const base: ApexOptions = {
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'bar',
        toolbar: { show: false },
        zoom: { enabled: false },
        stacked: visao === 'ano',
      },
      dataLabels: { enabled: false },
      // Sem override de markers: no Apex 4 ele quebra o flow da legenda e os
      // itens empilham um por linha (formato do ProventosHistoricoChart).
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        fontFamily: 'Outfit, sans-serif',
        fontSize: '12px',
        labels: { colors: isDarkMode ? '#ffffff' : '#000000' },
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
    };

    if (visao === 'mes') {
      return {
        ...base,
        colors: [COLOR_ORCADO, colorReal],
        plotOptions: { bar: { columnWidth: '55%', borderRadius: 2 } },
        xaxis: {
          categories: porCategoria?.nomes ?? [],
          labels: {
            style: { colors: '#64748B', fontSize: '11px' },
            rotate: -35,
            rotateAlways: (porCategoria?.nomes.length ?? 0) > 5,
            hideOverlappingLabels: false,
            trim: true,
          },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
      };
    }

    return {
      ...base,
      colors: [COLOR_ORCADO, ...coresPorNome(anual?.nomes ?? [])],
      // Muitas séries: legenda embaixo, quebrando linha. Sem o cluster por
      // grupo (default do grouped-stacked) — ele empilha cada grupo em coluna
      // vertical e esmaga o gráfico.
      legend: {
        ...base.legend,
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: '11px',
        itemMargin: { horizontal: 6, vertical: 1 },
        clusterGroupedSeries: false,
      },
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 2 } },
      xaxis: {
        categories: [...MONTHS],
        labels: { style: { colors: '#64748B', fontSize: '11px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
    };
  }, [visao, porCategoria, anual, colorReal, isDarkMode]);

  const series = useMemo(() => {
    if (visao === 'mes') {
      return [
        { name: 'Orçado', data: porCategoria?.orcado ?? [] },
        { name: 'Real', data: porCategoria?.real ?? [] },
      ];
    }
    // Grupos distintos ('orcado' × 'real') ficam lado a lado; as séries do
    // grupo 'real' empilham entre si — barra do Real dividida por categoria.
    return [
      {
        name: 'Orçado',
        group: 'orcado',
        data: Array(12).fill(Math.round(orcadoMensal * 100) / 100),
      },
      ...(anual?.nomes ?? []).map((nome, i) => ({
        name: nome,
        group: 'real',
        data: anual?.series[i] ?? [],
      })),
    ];
  }, [visao, porCategoria, anual, orcadoMensal]);

  const vazio =
    visao === 'mes'
      ? (porCategoria?.nomes.length ?? 0) === 0
      : orcadoMensal <= 0 && (anual?.nomes.length ?? 0) === 0;
  if (vazio) return null;

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      {/* Nome do gráfico homônimo da planilha-base */}
      <h4 className="mb-2 text-sm font-medium text-gray-800 dark:text-white/90">
        Orçamento vs. Atual{visao === 'mes' ? ` — ${MONTHS[mes]}` : ''}
      </h4>
      <ReactApexChart options={options} series={series} type="bar" height={280} />
    </div>
  );
}
