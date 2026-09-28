// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';
import {
  BAR_MOBILE_OPTIONS,
  LINE_MOBILE_OPTIONS,
  MOBILE_CHART_HEIGHT,
  chartAriaSummary,
  formatBRLCompact,
  mobileYAxis,
  useMobileChart,
} from '../mobileChartOptions';

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const BASE: ApexOptions = {
  chart: { type: 'line', toolbar: { show: true } },
  legend: { position: 'top' },
  yaxis: { title: { text: 'Patrimônio' } },
};

describe('useMobileChart', () => {
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('desktop: MESMA referência e altura de desktop', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMobileChart(BASE, { desktopHeight: 350 }));
    expect(result.current.options).toBe(BASE);
    expect(result.current.height).toBe(350);
    expect(result.current.isBelowLg).toBe(false);
  });

  it('celular: preset de linha + extra, altura 220', () => {
    stubMatchMedia(true);
    const extra: ApexOptions = { yaxis: mobileYAxis(BASE.yaxis) };
    const { result } = renderHook(() => useMobileChart(BASE, { desktopHeight: 350, extra }));
    const o = result.current.options;
    expect(o).not.toBe(BASE);
    expect(o.legend?.position).toBe('bottom');
    expect(o.chart?.toolbar?.show).toBe(false);
    expect(o.chart?.type).toBe('line');
    expect((o.yaxis as ApexYAxis).title?.text).toBe('');
    expect(result.current.height).toBe(MOBILE_CHART_HEIGHT);
    // base intocado
    expect(BASE.legend?.position).toBe('top');
  });

  it('celular: gráfico de barras usa o preset de barras', () => {
    stubMatchMedia(true);
    const base: ApexOptions = { chart: { type: 'bar' } };
    const { result } = renderHook(() =>
      useMobileChart(base, { desktopHeight: 300, mobileHeight: 240 }),
    );
    expect(result.current.options.plotOptions?.bar?.columnWidth).toBe('70%');
    expect(result.current.options.dataLabels?.enabled).toBe(false);
    expect(result.current.height).toBe(240);
  });
});

describe('mobileYAxis', () => {
  it('objeto: título vazio, 11px e R$ compacto', () => {
    const y = mobileYAxis({ title: { text: 'R$' }, min: 0 }) as ApexYAxis;
    expect(y.title?.text).toBe('');
    expect(y.min).toBe(0);
    expect(y.labels?.style?.fontSize).toBe('11px');
    expect((y.labels?.formatter as (v: number) => string)(1_200_000)).toBe('R$ 1,2 mi');
  });

  it('array: secundário sem rótulo', () => {
    const y = mobileYAxis([
      { seriesName: 'a' },
      { seriesName: 'b', opposite: true },
    ]) as ApexYAxis[];
    expect(y).toHaveLength(2);
    expect(y[0].labels?.show).toBe(true);
    expect(y[1].labels?.show).toBe(false);
    expect(y[1].opposite).toBe(true);
  });
});

describe('presets e helpers', () => {
  it('linha: 4 rótulos no x sem girar; barras herdam', () => {
    expect(LINE_MOBILE_OPTIONS.xaxis?.tickAmount).toBe(4);
    expect(LINE_MOBILE_OPTIONS.xaxis?.labels?.rotate).toBe(0);
    expect(BAR_MOBILE_OPTIONS.xaxis?.tickAmount).toBe(4);
  });

  it('formatBRLCompact', () => {
    expect(formatBRLCompact(950)).toBe('R$ 950');
    expect(formatBRLCompact(12_345)).toBe('R$ 12 mil');
    expect(formatBRLCompact(-2_500)).toBe('-R$ 2,5 mil');
    expect(formatBRLCompact(3_400_000_000)).toBe('R$ 3,4 bi');
  });

  it('chartAriaSummary', () => {
    expect(chartAriaSummary('Patrimônio projetado', 'R$ 1,2 mi aos 65')).toEqual({
      role: 'img',
      'aria-label': 'Patrimônio projetado: R$ 1,2 mi aos 65',
    });
  });
});
