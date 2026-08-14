import { describe, expect, it } from 'vitest';
import { alinharSeriesComparativas } from '../alinhamentoSeries';
import type { IndexData, IndexResponse } from '@/hooks/useIndices';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2025, 6, 1); // 01/07/2025

const serie = (startDay: number, values: number[]): IndexData[] =>
  values.map((value, i) => ({ date: T0 + (startDay + i) * DAY, value }));

const bench = (name: string, data: IndexData[]): IndexResponse => ({
  symbol: name,
  name,
  data,
});

/** Invariantes do contrato — valem para QUALQUER resultado do alinhador. */
const expectInvariantes = (res: ReturnType<typeof alinharSeriesComparativas>) => {
  const todas = [
    ...(res.carteira.length > 0 ? [{ name: 'Carteira', data: res.carteira }] : []),
    ...res.benchmarks.map((b) => ({ name: b.name, data: b.data })),
  ];
  for (const s of todas) {
    // 1. Toda série começa em exatamente 0%.
    expect(s.data[0].value, `${s.name} deve ancorar em 0`).toBe(0);
    // 2. Datas crescentes.
    for (let i = 1; i < s.data.length; i++) {
      expect(s.data[i].date, `${s.name} datas crescentes`).toBeGreaterThan(s.data[i - 1].date);
    }
    // 3. Nenhum ponto fora da janela.
    if (res.janela) {
      expect(s.data[0].date).toBeGreaterThanOrEqual(res.janela.inicio);
      expect(s.data[s.data.length - 1].date).toBeLessThanOrEqual(res.janela.fim);
    }
  }
};

describe('alinharSeriesComparativas — invariantes', () => {
  it('caso do bug: benchmark mais largo que a carteira é cortado à janela dela', () => {
    // Carteira começa no dia 100; IBOV existe desde o dia 0 (janela rolante de 1 ano).
    const carteira = serie(100, [-15.3, -14.8, -14.1, -13.9]);
    const ibov = bench(
      'IBOV',
      serie(
        0,
        Array.from({ length: 200 }, (_, i) => i * 0.3),
      ),
    );

    const res = alinharSeriesComparativas({ carteira, benchmarks: [ibov] });
    expectInvariantes(res);

    // Janela = janela da carteira: t0 um dia antes do 1º retorno dela.
    expect(res.janela).not.toBeNull();
    expect(res.janela!.inicio).toBe(T0 + 99 * DAY);
    expect(res.janela!.fim).toBe(T0 + 103 * DAY);

    // IBOV não pode mais começar ANTES da carteira.
    const ibovAlinhado = res.benchmarks[0].data;
    expect(ibovAlinhado[0].date).toBe(res.janela!.inicio);
    expect(ibovAlinhado[0].value).toBe(0);
    // E é rebaseado pelo acumulado que tinha em t0 (29,7% no dia 99):
    // dia 100 tinha 30,0% → alinhado ≈ (1.300/1.297 − 1) = 0,231%.
    expect(ibovAlinhado[1].value).toBeCloseTo((1.3 / 1.297 - 1) * 100, 6);
  });

  it('caso do bug: carteira com 1º valor ≠ 0 ganha âncora sintética 0% um dia antes (ganho instantâneo preservado)', () => {
    const carteira = serie(10, [-15.3, -14.0]);
    const res = alinharSeriesComparativas({ carteira, benchmarks: [] });
    expectInvariantes(res);

    expect(res.carteira).toHaveLength(3);
    expect(res.carteira[0]).toEqual({ date: T0 + 9 * DAY, value: 0 });
    // O retorno do dia 1 (-15,3%) NÃO é rebaseado — é o ganho instantâneo.
    expect(res.carteira[1].value).toBe(-15.3);
    expect(res.carteira[res.carteira.length - 1].value).toBe(-14.0);
  });

  it('série de período (twrStartDate) que já começa em 0 não ganha âncora duplicada', () => {
    const carteira = serie(10, [0, 1.2, 2.5]);
    const res = alinharSeriesComparativas({ carteira, benchmarks: [] });
    expectInvariantes(res);
    expect(res.carteira).toHaveLength(3);
    expect(res.carteira[0].value).toBe(0);
  });

  it('benchmark com histórico raso (começa depois de t0) ancora na própria 1ª data, sem zeros fabricados', () => {
    const carteira = serie(0, [-1, 0.5, 1.0, 2.0, 3.0, 4.0]);
    // CDI só existe a partir do dia 3, com base própria já acumulada.
    const cdi = bench('CDI', serie(3, [7.0, 7.1, 7.2]));

    const res = alinharSeriesComparativas({ carteira, benchmarks: [cdi] });
    expectInvariantes(res);

    const cdiAlinhado = res.benchmarks[0].data;
    // Começa na própria 1ª data (dia 3), em 0 — nada plotado antes disso.
    expect(cdiAlinhado[0].date).toBe(T0 + 3 * DAY);
    expect(cdiAlinhado[0].value).toBe(0);
    expect(cdiAlinhado[1].value).toBeCloseTo((1.071 / 1.07 - 1) * 100, 6);
  });

  it('pontos do benchmark DEPOIS do fim da carteira são descartados (dado defasado não estica o eixo)', () => {
    const carteira = serie(0, [-1, 1, 2]); // termina no dia 2
    const cdi = bench('CDI', serie(0, [0, 0.1, 0.2, 0.3, 0.4, 0.5])); // vai até o dia 5

    const res = alinharSeriesComparativas({ carteira, benchmarks: [cdi] });
    expectInvariantes(res);

    const cdiAlinhado = res.benchmarks[0].data;
    expect(cdiAlinhado[cdiAlinhado.length - 1].date).toBe(T0 + 2 * DAY);
  });

  it('periodoInicio corta a carteira e move a âncora junto', () => {
    const carteira = serie(0, [-1, 1, 2, 3, 4, 5, 6, 7]);
    const cdi = bench('CDI', serie(0, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]));

    const res = alinharSeriesComparativas({
      carteira,
      benchmarks: [cdi],
      periodoInicio: T0 + 4 * DAY,
    });
    expectInvariantes(res);

    expect(res.janela!.inicio).toBe(T0 + 3 * DAY);
    expect(res.carteira[0]).toEqual({ date: T0 + 3 * DAY, value: 0 });
    expect(res.carteira[1].value).toBe(4); // pontos anteriores saíram
  });

  it('último valor de cada série = acumulado DA JANELA (contrato com o card de resumo)', () => {
    const carteira = serie(0, [0, 2, 4]);
    // CDI acumulado 10% ANTES da janela; dentro dela rende ~2%.
    const cdi = bench('CDI', [
      { date: T0 - 5 * DAY, value: 8 },
      { date: T0 - 1 * DAY, value: 10 },
      ...serie(0, [10.2, 11.0, 12.2]),
    ]);

    const res = alinharSeriesComparativas({ carteira, benchmarks: [cdi] });
    expectInvariantes(res);

    const cdiAlinhado = res.benchmarks[0].data;
    // (1.122 / 1.10 − 1) = 2% — o acumulado só da janela, não os 12,2% totais.
    expect(cdiAlinhado[cdiAlinhado.length - 1].value).toBeCloseTo(2.0, 6);
  });

  it('sem carteira: benchmarks seguem visíveis, cada um ancorado em 0 na própria 1ª data', () => {
    const cdi = bench('CDI', serie(0, [5, 5.5, 6]));
    const res = alinharSeriesComparativas({ carteira: [], benchmarks: [cdi] });

    expect(res.janela).toBeNull();
    expect(res.carteira).toEqual([]);
    expect(res.benchmarks[0].data[0].value).toBe(0);
  });

  it('benchmark sem interseção com a janela é removido (não plota lixo)', () => {
    const carteira = serie(0, [-1, 1]);
    const cdi = bench('CDI', serie(50, [1, 2, 3])); // só existe muito depois

    const res = alinharSeriesComparativas({ carteira, benchmarks: [cdi] });
    expect(res.benchmarks).toHaveLength(0);
  });

  it('séries fora de ordem são ordenadas antes de tudo', () => {
    const carteira = [
      { date: T0 + 2 * DAY, value: 3 },
      { date: T0, value: -1 },
      { date: T0 + DAY, value: 1 },
    ];
    const res = alinharSeriesComparativas({ carteira, benchmarks: [] });
    expectInvariantes(res);
    expect(res.carteira.map((p) => p.value)).toEqual([0, -1, 1, 3]);
  });
});
