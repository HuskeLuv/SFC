import { describe, it, expect } from 'vitest';
import {
  buildSaldoContaCorrenteAnterior,
  buildFluxoLivreByMonth,
  computeEvolucaoSeries,
  resolveRealUpTo,
} from '../evolucaoPatrimonioSeries';

const fill = (value: number) => Array(12).fill(value);

describe('buildSaldoContaCorrenteAnterior', () => {
  it('janeiro puxa dezembro do ano anterior; demais meses puxam o mês anterior', () => {
    const cc = [100, 200, 0, ...Array(9).fill(0)];
    const result = buildSaldoContaCorrenteAnterior(cc, 639.9);
    expect(result[0]).toBeCloseTo(639.9);
    expect(result[1]).toBe(100);
    expect(result[2]).toBe(200);
    expect(result[3]).toBe(0);
  });
});

describe('buildFluxoLivreByMonth', () => {
  it('fluxo livre = saldo do mês + saldo CC anterior − aportes (não acumulado)', () => {
    // Cenário do vídeo do Pedro: sobra 2.000/mês, 639,90 parados de dez/2025.
    // Jan: aplica 2.000 → fluxo livre 639,90. O cliente reporta 639,90 na CC.
    // Fev: aplica 3.539,90 (2.900 + 639,90) → fluxo livre zera.
    const result = buildFluxoLivreByMonth({
      entradasByMonth: fill(15500),
      despesasByMonth: [13500, 12600, ...fill(11800).slice(2)],
      contaCorrenteByMonth: [639.9, 0, ...fill(0).slice(2)],
      saldoDezembroAnterior: 639.9,
      aportesByMonth: [2000, 3539.9, ...fill(0).slice(2)],
    });
    expect(result[0]).toBeCloseTo(639.9); // 2000 + 639,90 − 2000
    expect(result[1]).toBeCloseTo(0); // 2900 + 639,90 − 3539,90
    expect(result[2]).toBeCloseTo(3700); // 3700 + 0 − 0
  });
});

describe('computeEvolucaoSeries', () => {
  it('mês real = base + aportes acumulados + fluxo livre; futuro encadeia', () => {
    const series = computeEvolucaoSeries({
      baseAplicada: 865514.62,
      aportesByMonth: [2000, 3539.9, ...fill(0).slice(2)],
      fluxoLivreByMonth: [639.9, 0, ...fill(3700).slice(2)],
      snapshotByMonth: {},
      realUpTo: 1,
    });
    // Jan (real): base + 2000 + 639,90
    expect(series[0]).toBeCloseTo(868154.52);
    // Fev (real): base + 5539,90 + 0
    expect(series[1]).toBeCloseTo(871054.52);
    // Mar em diante (projeção): anterior + 3700
    expect(series[2]).toBeCloseTo(874754.52);
    expect(series[11]).toBeCloseTo(874754.52 + 9 * 3700);
  });

  it('snapshot travado tem precedência e ancora a projeção seguinte', () => {
    const series = computeEvolucaoSeries({
      baseAplicada: 100000,
      aportesByMonth: fill(0),
      fluxoLivreByMonth: fill(1000),
      snapshotByMonth: { 0: 105000 },
      realUpTo: 0,
    });
    expect(series[0]).toBe(105000); // valor congelado, não o calculado (101000)
    expect(series[1]).toBe(106000); // projeção parte do snapshot
  });

  it('ano futuro (realUpTo = -1) projeta tudo a partir da base', () => {
    const series = computeEvolucaoSeries({
      baseAplicada: 50000,
      aportesByMonth: fill(0),
      fluxoLivreByMonth: fill(2000),
      snapshotByMonth: {},
      realUpTo: -1,
    });
    expect(series[0]).toBe(52000);
    expect(series[11]).toBe(50000 + 12 * 2000);
  });
});

describe('resolveRealUpTo', () => {
  const now = new Date(2026, 6, 6); // 06/jul/2026

  it('ano passado → 11, ano corrente → mês atual, ano futuro → -1', () => {
    expect(resolveRealUpTo(2025, now)).toBe(11);
    expect(resolveRealUpTo(2026, now)).toBe(6);
    expect(resolveRealUpTo(2027, now)).toBe(-1);
  });
});
