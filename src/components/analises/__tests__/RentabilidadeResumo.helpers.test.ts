import { describe, it, expect } from 'vitest';
import { calcularRentabilidade, valorEm, dropCurrentDay } from '../RentabilidadeResumo';

const day = (offsetDias: number): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDias);
  return d.getTime();
};

describe('valorEm — último ponto <= ref', () => {
  const serie = [
    { date: day(-10), value: 1 },
    { date: day(-5), value: 3 },
    { date: day(-1), value: 5 },
  ];

  it('devolve o ponto exato quando existe', () => {
    expect(valorEm(serie, day(-5))).toBe(3);
  });

  it('herda o ponto anterior quando ref cai entre pontos', () => {
    expect(valorEm(serie, day(-3))).toBe(3);
  });

  it('null quando ref é anterior a toda a série', () => {
    expect(valorEm(serie, day(-20))).toBeNull();
  });
});

describe('calcularRentabilidade — janela sobre série de acumulados', () => {
  const serie = [
    { date: day(-365), value: 0 },
    { date: day(-180), value: 5 },
    { date: day(-1), value: 10 },
  ];

  it('compõe (1+fim)/(1+inicio)-1', () => {
    // De -180 (5%) até -1 (10%): 1.10/1.05 - 1 = 4.7619%
    expect(calcularRentabilidade(serie, day(-180), day(0))).toBeCloseTo(4.7619, 3);
  });

  it('janela que começa entre pontos herda o acumulado anterior (não devolve 0)', () => {
    // Início em -90 (entre -180 e -1) herda 5%: mesmo resultado da janela -180
    expect(calcularRentabilidade(serie, day(-90), day(0))).toBeCloseTo(4.7619, 3);
  });

  it('início antes da série clampa no primeiro ponto', () => {
    expect(calcularRentabilidade(serie, day(-9999), day(0))).toBeCloseTo(10, 3);
  });

  it('valorInicio 0% não zera o resultado (bug antigo: if(valorInicio===0) return 0)', () => {
    expect(calcularRentabilidade(serie, day(-365), day(0))).toBeCloseTo(10, 3);
  });

  it('série vazia devolve 0', () => {
    expect(calcularRentabilidade([], day(-10), day(0))).toBe(0);
  });
});

describe('dropCurrentDay', () => {
  it('remove o ponto do dia corrente (parcial)', () => {
    const serie = [
      { date: day(-2), value: 1 },
      { date: day(-1), value: 2 },
      { date: day(0), value: 3 },
    ];
    const out = dropCurrentDay(serie);
    expect(out).toHaveLength(2);
    expect(out[out.length - 1].value).toBe(2);
  });

  it('mantém a série quando só existe o dia corrente (não zera o card)', () => {
    const serie = [{ date: day(0), value: 3 }];
    expect(dropCurrentDay(serie)).toHaveLength(1);
  });
});
