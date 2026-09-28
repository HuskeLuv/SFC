'use client';

import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { deepMergeOptions } from './ApexChartWrapper';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

/**
 * Opções de gráfico SÓ do celular (PWA fase 3), para os ReactApexChart de Aposentadoria, Sonhos,
 * Saúde e Dívidas. No desktop `useMobileChart` devolve `base` (a MESMA referência) e a altura de
 * hoje — nada muda a partir de lg.
 */

export const MOBILE_CHART_HEIGHT = 220;

const GRID_LIGHT = '#EAEAEA';
const GRID_DARK = '#2A2F3A';

const isDark = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

/** Linha: legenda embaixo (12px), 4 rótulos no eixo x sem girar, sem toolbar/zoom. */
export const LINE_MOBILE_OPTIONS: ApexOptions = {
  chart: { toolbar: { show: false }, zoom: { enabled: false } },
  legend: { position: 'bottom', fontSize: '12px' },
  xaxis: {
    tickAmount: 4,
    labels: {
      rotate: 0,
      rotateAlways: false,
      hideOverlappingLabels: true,
      style: { fontSize: '11px' },
    },
  },
  grid: { borderColor: GRID_LIGHT },
};

/** Barras: as mesmas regras da linha, colunas de 70% e sem rótulo de dado. */
export const BAR_MOBILE_OPTIONS: ApexOptions = deepMergeOptions(LINE_MOBILE_OPTIONS, {
  plotOptions: { bar: { columnWidth: '70%' } },
  dataLabels: { enabled: false },
});

/** R$ compacto para eixo: R$ 950, R$ 12 mil, R$ 1,2 mi, R$ 3,4 bi. */
export function formatBRLCompact(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (abs >= 1e9) return `${sign}R$ ${fmt(abs / 1e9)} bi`;
  if (abs >= 1e6) return `${sign}R$ ${fmt(abs / 1e6)} mi`;
  if (abs >= 1e3) return `${sign}R$ ${fmt(abs / 1e3)} mil`;
  return `${sign}R$ ${Math.round(abs).toLocaleString('pt-BR')}`;
}

type YAxis = ApexYAxis;

function mobileYAxisOne(y: YAxis | undefined, secondary: boolean): YAxis {
  const base: YAxis = y ?? {};
  return deepMergeOptions(base, {
    title: { text: '' },
    labels: {
      show: !secondary,
      style: { fontSize: '11px' },
      formatter: (v: number) => formatBRLCompact(v),
    },
  });
}

/** Eixo y compacto (objeto ou array; no array, os secundários ficam sem rótulo). */
export function mobileYAxis(y: ApexOptions['yaxis']): ApexOptions['yaxis'] {
  if (Array.isArray(y)) return y.map((axis, i) => mobileYAxisOne(axis, i > 0));
  return mobileYAxisOne(y, false);
}

export interface UseMobileChartOptions {
  extra?: ApexOptions;
  desktopHeight: number;
  mobileHeight?: number;
}

/**
 * Celular: `base` + LINE_MOBILE_OPTIONS (tipo bar → BAR_MOBILE_OPTIONS) + `extra` (ex.:
 * `{ yaxis: mobileYAxis(base.yaxis) }` nos gráficos em R$ — o eixo não vira R$ sozinho, há
 * gráficos em %), na altura `mobileHeight ?? MOBILE_CHART_HEIGHT`. Desktop: `base` e `desktopHeight`.
 */
export function useMobileChart(
  base: ApexOptions,
  { extra, desktopHeight, mobileHeight = MOBILE_CHART_HEIGHT }: UseMobileChartOptions,
): { options: ApexOptions; height: number; isBelowLg: boolean } {
  const isBelowLg = useIsBelowLg();
  const options = useMemo(() => {
    if (!isBelowLg) return base;
    const isBar = base.chart?.type === 'bar';
    const preset = isBar ? BAR_MOBILE_OPTIONS : LINE_MOBILE_OPTIONS;
    const merged = deepMergeOptions(deepMergeOptions(base, preset), {
      grid: { borderColor: isDark() ? GRID_DARK : GRID_LIGHT },
    });
    return extra ? deepMergeOptions(merged, extra) : merged;
  }, [base, extra, isBelowLg]);
  return { options, height: isBelowLg ? mobileHeight : desktopHeight, isBelowLg };
}

/** Nome acessível do gráfico no celular (aplicar só no ramo mobile). */
export function chartAriaSummary(
  label: string,
  value: string,
): { role: 'img'; 'aria-label': string } {
  return { role: 'img', 'aria-label': `${label}: ${value}` };
}
