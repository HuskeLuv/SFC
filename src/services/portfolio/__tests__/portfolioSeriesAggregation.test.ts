import { describe, it, expect } from 'vitest';
import {
  CHART_MAX_POINTS,
  applyChartAggregation,
  downsampleKeepingMonthEnds,
  downsampleUniform,
} from '../portfolioSeriesAggregation';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Série diária (UTC midnight) a partir de 2020-06-01, só dias úteis. */
const mkDaily = (days: number) => {
  const start = Date.UTC(2020, 5, 1);
  const out: Array<{ data: number; value: number }> = [];
  let ts = start;
  while (out.length < days) {
    const dow = new Date(ts).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push({ data: ts, value: out.length });
    ts += DAY_MS;
  }
  return out;
};

const lastOfEachMonth = (serie: Array<{ data: number }>) => {
  const byMonth = new Map<string, number>();
  for (const p of serie) byMonth.set(new Date(p.data).toISOString().slice(0, 7), p.data);
  return [...byMonth.values()];
};

describe('downsampleKeepingMonthEnds', () => {
  it('não altera séries que já cabem em maxPoints', () => {
    const serie = mkDaily(100);
    expect(downsampleKeepingMonthEnds(serie, 500, (p) => p.data)).toBe(serie);
  });

  it('preserva o último ponto de cada mês (o uniforme puro os descarta)', () => {
    const serie = mkDaily(1600); // ~6 anos úteis
    const uniform = downsampleUniform(serie, CHART_MAX_POINTS);
    const kept = downsampleKeepingMonthEnds(serie, CHART_MAX_POINTS, (p) => p.data);

    const monthEnds = lastOfEachMonth(serie);
    const uniformTs = new Set(uniform.map((p) => p.data));
    const keptTs = new Set(kept.map((p) => p.data));

    // sanidade do cenário: o uniforme perde fins de mês
    expect(monthEnds.some((ts) => !uniformTs.has(ts))).toBe(true);
    // o novo mantém TODOS
    for (const ts of monthEnds) expect(keptTs.has(ts)).toBe(true);
  });

  it('mantém primeiro e último ponto, ordem crescente e tamanho limitado', () => {
    const serie = mkDaily(1600);
    const kept = downsampleKeepingMonthEnds(serie, CHART_MAX_POINTS, (p) => p.data);
    expect(kept[0]).toBe(serie[0]);
    expect(kept[kept.length - 1]).toBe(serie[serie.length - 1]);
    for (let i = 1; i < kept.length; i++) expect(kept[i].data).toBeGreaterThan(kept[i - 1].data);
    const months = lastOfEachMonth(serie).length;
    expect(kept.length).toBeLessThanOrEqual(CHART_MAX_POINTS + months);
  });

  it('fechamento mensal reconstruído a partir do downsample bate com a série cheia', () => {
    const serie = mkDaily(1600);
    const kept = downsampleKeepingMonthEnds(serie, CHART_MAX_POINTS, (p) => p.data);
    const closeFull = lastOfEachMonth(serie);
    const closeKept = lastOfEachMonth(kept);
    expect(closeKept).toEqual(closeFull);
  });
});

describe('applyChartAggregation', () => {
  it('usa o downsample que preserva fins de mês nas duas séries', () => {
    const twr = mkDaily(1600);
    const patrimonio = twr.map((p) => ({ data: p.data, valorAplicado: 1, saldoBruto: 1 }));
    const r = applyChartAggregation(patrimonio, twr, twr[0].data, twr[twr.length - 1].data);
    const monthEnds = lastOfEachMonth(twr);
    const twrTs = new Set(r.historicoTWR.map((p) => p.data));
    const patTs = new Set(r.historicoPatrimonio.map((p) => p.data));
    for (const ts of monthEnds) {
      expect(twrTs.has(ts)).toBe(true);
      expect(patTs.has(ts)).toBe(true);
    }
    expect(r.granularity).toBe('day');
  });
});
