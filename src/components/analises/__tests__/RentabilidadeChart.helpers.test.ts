import { describe, it, expect } from 'vitest';
import { groupByMonth, groupByYear, toPeriodReturns } from '../RentabilidadeChart';

describe('groupByMonth — buckets em UTC', () => {
  it('mantém o ponto de dia 1º 00:00Z no mês certo (não desloca pro mês anterior)', () => {
    // Bug original: getMonth() local em UTC-3 jogava 01/06 00:00Z pra maio.
    const result = groupByMonth([{ date: Date.UTC(2026, 5, 1), value: 3 }]);
    expect(result).toEqual([{ date: Date.UTC(2026, 5, 1), value: 3 }]);
  });

  it('pega o último valor cumulativo de cada mês', () => {
    const result = groupByMonth([
      { date: Date.UTC(2026, 4, 5), value: 1 },
      { date: Date.UTC(2026, 4, 30), value: 2 },
      { date: Date.UTC(2026, 5, 1), value: 2.5 },
      { date: Date.UTC(2026, 5, 20), value: 4 },
    ]);
    expect(result).toEqual([
      { date: Date.UTC(2026, 4, 1), value: 2 },
      { date: Date.UTC(2026, 5, 1), value: 4 },
    ]);
  });

  it('ignora itens inválidos e devolve vazio para entrada vazia', () => {
    expect(groupByMonth([])).toEqual([]);
    expect(groupByMonth([{ date: 1, value: 'x' as unknown as number }])).toEqual([]);
  });
});

describe('groupByYear — buckets em UTC', () => {
  it('mantém 1º de janeiro 00:00Z no ano certo (sintoma: "2025" duplicado no eixo)', () => {
    const result = groupByYear([{ date: Date.UTC(2026, 0, 1), value: 0 }]);
    expect(result).toEqual([{ date: Date.UTC(2026, 0, 1), value: 0 }]);
  });

  it('pega o último valor cumulativo de cada ano', () => {
    const result = groupByYear([
      { date: Date.UTC(2025, 2, 10), value: 5 },
      { date: Date.UTC(2025, 11, 31), value: 8 },
      { date: Date.UTC(2026, 5, 15), value: 12 },
    ]);
    expect(result).toEqual([
      { date: Date.UTC(2025, 0, 1), value: 8 },
      { date: Date.UTC(2026, 0, 1), value: 12 },
    ]);
  });
});

describe('toPeriodReturns — acumulado → retorno do bucket', () => {
  it('primeiro bucket usa base 0 (série rebaseada no início da janela)', () => {
    const result = toPeriodReturns([{ date: Date.UTC(2026, 0, 1), value: 2 }]);
    expect(result[0].value).toBeCloseTo(2, 10);
  });

  it('buckets seguintes compõem (1+atual)/(1+anterior)-1', () => {
    const result = toPeriodReturns([
      { date: Date.UTC(2026, 0, 1), value: 2 },
      { date: Date.UTC(2026, 1, 1), value: 5.06 },
    ]);
    // (1.0506 / 1.02 - 1) * 100 = 3%
    expect(result[1].value).toBeCloseTo(3, 6);
  });

  it('barras compõem de volta ao acumulado final', () => {
    const cumulative = [
      { date: Date.UTC(2025, 0, 1), value: 4 },
      { date: Date.UTC(2025, 1, 1), value: 2.5 },
      { date: Date.UTC(2025, 2, 1), value: 7.8 },
      { date: Date.UTC(2025, 3, 1), value: 6.1 },
    ];
    const returns = toPeriodReturns(cumulative);
    const composed = returns.reduce((acc, r) => acc * (1 + r.value / 100), 1);
    expect((composed - 1) * 100).toBeCloseTo(6.1, 8);
  });

  it('suporta retornos negativos no bucket (queda vs mês anterior)', () => {
    const result = toPeriodReturns([
      { date: Date.UTC(2025, 0, 1), value: 10 },
      { date: Date.UTC(2025, 1, 1), value: 4.5 },
    ]);
    // (1.045 / 1.10 - 1) * 100 = -5%
    expect(result[1].value).toBeCloseTo(-5, 6);
  });

  it('ordena por data antes de diferenciar', () => {
    const result = toPeriodReturns([
      { date: Date.UTC(2025, 1, 1), value: 5.06 },
      { date: Date.UTC(2025, 0, 1), value: 2 },
    ]);
    expect(result.map((r) => r.date)).toEqual([Date.UTC(2025, 0, 1), Date.UTC(2025, 1, 1)]);
    expect(result[0].value).toBeCloseTo(2, 10);
    expect(result[1].value).toBeCloseTo(3, 6);
  });

  it('devolve vazio para entrada vazia', () => {
    expect(toPeriodReturns([])).toEqual([]);
  });
});
