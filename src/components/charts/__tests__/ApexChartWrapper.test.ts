import { describe, expect, it } from 'vitest';
import { deepMergeOptions } from '../ApexChartWrapper';

describe('deepMergeOptions (mobileOptions do ApexChartWrapper)', () => {
  it('funde objetos em profundidade sem mutar a base', () => {
    const formatter = (v: number) => `${v}%`;
    const base = {
      chart: { type: 'donut', height: 350 },
      legend: { position: 'right', fontSize: '14px' },
      dataLabels: { formatter },
    };
    const merged = deepMergeOptions(base, {
      legend: { position: 'bottom' },
      chart: { height: 260 },
    });
    expect(merged).toEqual({
      chart: { type: 'donut', height: 260 },
      legend: { position: 'bottom', fontSize: '14px' },
      dataLabels: { formatter },
    });
    expect(merged.dataLabels.formatter).toBe(formatter);
    expect(base.legend.position).toBe('right');
  });

  it('arrays e funções substituem; undefined não apaga', () => {
    const base = {
      colors: ['#000', '#111'],
      responsive: [{ breakpoint: 640 }],
      title: { text: 'A' },
    };
    const merged = deepMergeOptions(base, { colors: ['#222'], title: undefined });
    expect(merged.colors).toEqual(['#222']);
    expect(merged.responsive).toEqual([{ breakpoint: 640 }]);
    expect(merged.title).toEqual({ text: 'A' });
  });
});
