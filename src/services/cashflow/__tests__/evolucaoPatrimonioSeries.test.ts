import { describe, it, expect } from 'vitest';
import {
  buildSaldoContaCorrenteAnterior,
  buildFluxoLivreByMonth,
  computeEvolucaoSeries,
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
  it('cenário do vídeo do Pedro (Conta Corrente disciplinada) — série idêntica ao modelo antigo', () => {
    // Jan aplica 2.000 e reporta a sobra 639,90 na CC; fev aplica tudo (3.539,90).
    const series = computeEvolucaoSeries({
      baseAplicada: 865514.62,
      aportesByMonth: [2000, 3539.9, ...fill(0).slice(2)],
      fluxoLivreByMonth: [639.9, 0, ...fill(3700).slice(2)],
      saldoAnteriorByMonth: [639.9, 639.9, 0, ...fill(0).slice(3)],
      snapshotByMonth: {},
    });
    // Jan (âncora anual): base + 2000 + 639,90 (carry de dez fica no fluxo de jan)
    expect(series[0]).toBeCloseTo(868154.52);
    // Fev: anterior + 3539,90 + (0 − 639,90) — o carry sai para não contar dobrado
    expect(series[1]).toBeCloseTo(871054.52);
    // Mar em diante (projeção): anterior + 3700
    expect(series[2]).toBeCloseTo(874754.52);
    expect(series[11]).toBeCloseTo(874754.52 + 9 * 3700);
  });

  it('encadeado: sobra de mês anterior permanece mesmo sem registro na Conta Corrente', () => {
    // Exemplo do Pedro: jan 30k aportes + 5k FCL = 35k; fev aporta 10k e sobra 5k de novo.
    const series = computeEvolucaoSeries({
      baseAplicada: 0,
      aportesByMonth: [30000, 10000, ...fill(0).slice(2)],
      fluxoLivreByMonth: fill(5000),
      saldoAnteriorByMonth: fill(0),
      snapshotByMonth: {},
    });
    expect(series[0]).toBe(35000);
    // Fev = 35k + 10k + 5k — a sobra de jan segue dentro do valor (modelo antigo daria 45k)
    expect(series[1]).toBe(50000);
    // Mar (projeção, sem aportes): anterior + 5k
    expect(series[2]).toBe(55000);
  });

  it('Conta Corrente preenchida não conta a mesma sobra duas vezes', () => {
    // Mesmo cenário, mas o cliente registrou a sobra de jan (5k) na CC:
    // o fluxo livre de fev sobe para 10k e o carry (5k) é descontado.
    const series = computeEvolucaoSeries({
      baseAplicada: 0,
      aportesByMonth: [30000, 10000, ...fill(0).slice(2)],
      fluxoLivreByMonth: [5000, 10000, ...fill(5000).slice(2)],
      saldoAnteriorByMonth: [0, 5000, ...fill(0).slice(2)],
      snapshotByMonth: {},
    });
    expect(series[0]).toBe(35000);
    expect(series[1]).toBe(50000); // idêntico ao cenário sem disciplina de CC
  });

  it('snapshot travado tem precedência e ancora o encadeamento seguinte', () => {
    const series = computeEvolucaoSeries({
      baseAplicada: 100000,
      aportesByMonth: fill(0),
      fluxoLivreByMonth: fill(1000),
      saldoAnteriorByMonth: fill(0),
      snapshotByMonth: { 0: 105000 },
    });
    expect(series[0]).toBe(105000); // valor congelado, não o calculado (101000)
    expect(series[1]).toBe(106000); // mês seguinte encadeia a partir do snapshot
  });

  it('ano futuro projeta tudo a partir da base (aportes zerados)', () => {
    const series = computeEvolucaoSeries({
      baseAplicada: 50000,
      aportesByMonth: fill(0),
      fluxoLivreByMonth: fill(2000),
      saldoAnteriorByMonth: fill(0),
      snapshotByMonth: {},
    });
    expect(series[0]).toBe(52000);
    expect(series[11]).toBe(50000 + 12 * 2000);
  });
});
