import { monthKeyUtc } from '@/utils/utcDay';

export const CHART_MAX_POINTS = 500;

export type PatrimonioPoint = { data: number; valorAplicado: number; saldoBruto: number };
export type TwrPoint = { data: number; value: number };

const monthKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const yearKey = (ts: number): string => String(new Date(ts).getFullYear());

/**
 * Agrega série diária → último ponto de cada mês (útil para períodos longos).
 */
export const aggregatePatrimonioDailyToMonthly = (series: PatrimonioPoint[]): PatrimonioPoint[] => {
  if (series.length === 0) return [];
  const byMonth = new Map<string, PatrimonioPoint>();
  for (const p of series) {
    byMonth.set(monthKey(p.data), p);
  }
  return [...byMonth.values()].sort((a, b) => a.data - b.data);
};

/**
 * Agrega série mensal → último ponto de cada ano.
 */
export const aggregatePatrimonioMonthlyToYearly = (
  series: PatrimonioPoint[],
): PatrimonioPoint[] => {
  if (series.length === 0) return [];
  const byYear = new Map<string, PatrimonioPoint>();
  for (const p of series) {
    byYear.set(yearKey(p.data), p);
  }
  return [...byYear.values()].sort((a, b) => a.data - b.data);
};

/**
 * Alinha TWR aos mesmos buckets (último cumulative do mês).
 */
export const aggregateTwrToMonthly = (series: TwrPoint[]): TwrPoint[] => {
  if (series.length === 0) return [];
  const byMonth = new Map<string, TwrPoint>();
  for (const p of series) {
    byMonth.set(monthKey(p.data), p);
  }
  return [...byMonth.values()].sort((a, b) => a.data - b.data);
};

export const aggregateTwrToYearly = (series: TwrPoint[]): TwrPoint[] => {
  if (series.length === 0) return [];
  const byYear = new Map<string, TwrPoint>();
  for (const p of series) {
    byYear.set(yearKey(p.data), p);
  }
  return [...byYear.values()].sort((a, b) => a.data - b.data);
};

/**
 * Downsample uniforme mantendo primeiro e último (para caber em ~CHART_MAX_POINTS).
 */
export const downsampleUniform = <T>(arr: T[], maxPoints: number): T[] => {
  if (arr.length <= maxPoints) return arr;
  if (maxPoints < 2) return [arr[arr.length - 1]!];
  const out: T[] = [];
  const step = (arr.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(arr[Math.round(i * step)]!);
  }
  return out;
};

/**
 * Downsample uniforme que PRESERVA o último ponto de cada mês (UTC). O gráfico
 * mensal/anual do front agrupa a série por mês e usa o último ponto de cada
 * bucket como "fechamento" — o uniforme puro descartava esse ponto e a barra
 * de agosto saía como 29/07→31/08 (+0,31% em vez de −1,27%, qa.teste.gorila
 * 01/09/2026). Custo: até +1 ponto por mês além de `maxPoints`.
 */
export const downsampleKeepingMonthEnds = <T>(
  arr: T[],
  maxPoints: number,
  getTs: (item: T) => number,
): T[] => {
  if (arr.length <= maxPoints) return arr;
  if (maxPoints < 2) return [arr[arr.length - 1]!];
  const keep = new Set<number>();
  const step = (arr.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) keep.add(Math.round(i * step));
  for (let i = 0; i + 1 < arr.length; i++) {
    if (monthKeyUtc(getTs(arr[i]!)) !== monthKeyUtc(getTs(arr[i + 1]!))) keep.add(i);
  }
  return [...keep].sort((a, b) => a - b).map((i) => arr[i]!);
};

export type ChartGranularity = 'day' | 'month' | 'year';

/**
 * Sempre 'day' — agregação mensal/anual da série da carteira criava linha em
 * escada quando comparada com benchmarks (CDI/IBOV/IPCA) que sempre vêm em
 * resolução diária. Excesso de pontos é resolvido por `downsampleUniform`
 * abaixo, que preserva a forma da curva sem clusterizar em fim de mês.
 *
 * (Antes: >5 anos → 'year'; >1 ano OU pontCount > MAX → 'month'; senão 'day'.
 * Isso fazia "Do início" de >12 meses cair no mensal e ficar em degrau.)
 */
export const chooseChartGranularity = (
  _startMs: number,
  _endMs: number,
  _dailyPointCount: number,
): ChartGranularity => {
  return 'day';
};

export const applyChartAggregation = (
  patrimonio: PatrimonioPoint[],
  twr: TwrPoint[],
  startMs: number,
  endMs: number,
): {
  historicoPatrimonio: PatrimonioPoint[];
  historicoTWR: TwrPoint[];
  granularity: ChartGranularity;
} => {
  if (patrimonio.length === 0) {
    return { historicoPatrimonio: [], historicoTWR: [], granularity: 'day' };
  }

  const g = chooseChartGranularity(startMs, endMs, patrimonio.length);
  let p = patrimonio;
  let t = twr;

  if (g === 'month') {
    p = aggregatePatrimonioDailyToMonthly(patrimonio);
    t = aggregateTwrToMonthly(twr);
  } else if (g === 'year') {
    p = aggregatePatrimonioMonthlyToYearly(aggregatePatrimonioDailyToMonthly(patrimonio));
    t = aggregateTwrToYearly(aggregateTwrToMonthly(twr));
  }

  if (p.length > CHART_MAX_POINTS) {
    p = downsampleKeepingMonthEnds(p, CHART_MAX_POINTS, (x) => x.data);
  }
  if (t.length > CHART_MAX_POINTS) {
    t = downsampleKeepingMonthEnds(t, CHART_MAX_POINTS, (x) => x.data);
  }

  return { historicoPatrimonio: p, historicoTWR: t, granularity: g };
};
