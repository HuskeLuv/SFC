export const CHART_MAX_POINTS = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

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

export type ChartGranularity = 'day' | 'month' | 'year';

/**
 * Escolhe granularidade: >5 anos → anual; >1 ano ou muitos pontos → mensal; senão diário.
 * Garante no máximo ~CHART_MAX_POINTS após agregação + downsample.
 */
export const chooseChartGranularity = (
  startMs: number,
  endMs: number,
  dailyPointCount: number,
): ChartGranularity => {
  const spanDays = Math.max(0, (endMs - startMs) / DAY_MS);
  if (spanDays > 365 * 5) return 'year';
  if (spanDays > 365 || dailyPointCount > CHART_MAX_POINTS) return 'month';
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
    p = downsampleUniform(p, CHART_MAX_POINTS);
  }
  if (t.length > CHART_MAX_POINTS) {
    t = downsampleUniform(t, CHART_MAX_POINTS);
  }

  return { historicoPatrimonio: p, historicoTWR: t, granularity: g };
};
