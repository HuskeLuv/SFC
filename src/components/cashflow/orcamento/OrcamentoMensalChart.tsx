'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useTheme } from '@/context/ThemeContext';
import { MONTHS } from '@/constants/cashflow';
import { formatBRL } from '@/utils/format';
import type { OrcamentoCategoria } from '@/services/cashflow/orcamentoVsReal';
import { coresPorNome } from './orcamentoCores';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

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
 * Paleta My Finance (ticket 24/08/2026): Orçado em cinza-transparencia
 * (#CCCCCC, neutro — é o plano); Real do modo Mês no azul-assinatura
 * (#0079F2); categorias nas mesmas cores do donut (`orcamentoCores`).
 */

const COLOR_ORCADO = MYFINANCE_BRAND.transparencia;
const COLOR_REAL = MYFINANCE_BRAND.outside;

/**
 * Celular (PWA fase 2, `variant='mobile'`): "Orçado × real" em BARRAS HORIZONTAIS na visão Mês
 * (14 nomes de categoria não cabem em colunas a 320px) e, no acumulado, meses com uma letra e a
 * legenda embaixo. Orçado em cinza (#CCCCCC / escuro #4A4F5A); real em azul patrimônio
 * (escuro tranquilidade) ou no vermelho semântico quando passa do orçado.
 */
const MOBILE_ORCADO = { light: MYFINANCE_BRAND.transparencia, dark: '#4A4F5A' };
const MOBILE_REAL = { light: MYFINANCE_BRAND.patrimonio, dark: MYFINANCE_BRAND.tranquilidade };
const MOBILE_ESTOUROU = { light: '#D92D20', dark: '#F97066' };
const MESES_LETRA = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** Rótulo curto de eixo: 'R$ 1,2 mil' / 'R$ 850'. */
export function formatBRLCurto(val: number): string {
  const abs = Math.abs(val);
  const sinal = val < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sinal}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (abs >= 1000) {
    return `${sinal}R$ ${(abs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return `${sinal}R$ ${Math.round(abs).toLocaleString('pt-BR')}`;
}

interface OrcamentoMensalChartProps {
  visao: 'mes' | 'ano';
  /** Mês selecionado (0-11) — usado só na visão 'mes'. */
  mes: number;
  modoReal: 'lancado' | 'consolidado';
  categorias: OrcamentoCategoria[];
  /** Soma das metas mensais das categorias (sem investimentos). */
  orcadoMensal: number;
  /** 'mobile' = versão do celular (PWA fase 2). Padrão: o gráfico de desktop, sem mudança. */
  variant?: 'default' | 'mobile';
}

export default function OrcamentoMensalChart({
  visao,
  mes,
  modoReal,
  categorias,
  orcadoMensal,
  variant = 'default',
}: OrcamentoMensalChartProps) {
  const isMobile = variant === 'mobile';
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

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
        colors: [COLOR_ORCADO, COLOR_REAL],
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
  }, [visao, porCategoria, anual, isDarkMode]);

  // Celular: opções próprias (o desktop acima fica intacto).
  const mobileOptions: ApexOptions | null = useMemo(() => {
    if (!isMobile) return null;
    const axisLabels = { colors: isDarkMode ? '#98A2B3' : '#64748B', fontSize: '11px' };
    const base: ApexOptions = {
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'bar',
        toolbar: { show: false },
        zoom: { enabled: false },
        stacked: visao === 'ano',
        animations: { enabled: false },
      },
      dataLabels: { enabled: false },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        fontFamily: 'Outfit, sans-serif',
        fontSize: '11px',
        labels: { colors: isDarkMode ? '#ffffff' : '#000000' },
        itemMargin: { horizontal: 6, vertical: 1 },
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
        colors: [
          isDarkMode ? MOBILE_ORCADO.dark : MOBILE_ORCADO.light,
          isDarkMode ? MOBILE_REAL.dark : MOBILE_REAL.light,
        ],
        plotOptions: { bar: { horizontal: true, barHeight: '70%', borderRadius: 2 } },
        xaxis: {
          categories: porCategoria?.nomes ?? [],
          tickAmount: 2,
          labels: {
            style: axisLabels,
            hideOverlappingLabels: true,
            formatter: (val: string) => formatBRLCurto(Number(val)),
          },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: { labels: { style: axisLabels, maxWidth: 92 } },
      };
    }
    return {
      ...base,
      colors: [
        isDarkMode ? MOBILE_ORCADO.dark : MOBILE_ORCADO.light,
        ...coresPorNome(anual?.nomes ?? []),
      ],
      legend: { ...base.legend, clusterGroupedSeries: false },
      plotOptions: { bar: { horizontal: false, columnWidth: '70%', borderRadius: 2 } },
      xaxis: {
        categories: [...MESES_LETRA],
        labels: { style: axisLabels },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        tickAmount: 4,
        labels: { style: axisLabels, formatter: (val: number) => formatBRLCurto(val) },
      },
    };
  }, [isMobile, visao, porCategoria, anual, isDarkMode]);

  const series = useMemo(() => {
    if (isMobile && visao === 'mes') {
      // Real de cada categoria no vermelho quando passa do orçado (cor por ponto).
      const estourou = isDarkMode ? MOBILE_ESTOUROU.dark : MOBILE_ESTOUROU.light;
      const real = isDarkMode ? MOBILE_REAL.dark : MOBILE_REAL.light;
      const nomes = porCategoria?.nomes ?? [];
      return [
        {
          name: 'Orçado',
          data: nomes.map((nome, i) => ({ x: nome, y: porCategoria?.orcado[i] ?? 0 })),
        },
        {
          name: 'Real',
          data: nomes.map((nome, i) => {
            const orcado = porCategoria?.orcado[i] ?? 0;
            const valor = porCategoria?.real[i] ?? 0;
            return {
              x: nome,
              y: valor,
              fillColor: orcado > 0 && valor - orcado > 0.005 ? estourou : real,
            };
          }),
        },
      ];
    }
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
  }, [visao, porCategoria, anual, orcadoMensal, isMobile, isDarkMode]);

  const vazio =
    visao === 'mes'
      ? (porCategoria?.nomes.length ?? 0) === 0
      : orcadoMensal <= 0 && (anual?.nomes.length ?? 0) === 0;
  if (vazio) return null;

  if (isMobile && mobileOptions) {
    const barras = porCategoria?.nomes.length ?? 0;
    return (
      <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="mb-1 text-[15px] font-semibold text-gray-800 dark:text-white/90">
          Orçado × real{visao === 'mes' ? ` · ${MONTHS[mes]}` : ' · acumulado'}
        </h3>
        {visao === 'mes' ? (
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
            Barra do real em vermelho quando passa do orçado.
          </p>
        ) : null}
        <ReactApexChart
          // Remonta ao trocar de visão: o Apex não desfaz `horizontal` numa atualização.
          key={visao}
          options={mobileOptions}
          series={series}
          type="bar"
          height={visao === 'mes' ? 36 * barras + 80 : 320}
          width="100%"
        />
      </div>
    );
  }

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
