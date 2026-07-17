import { describe, it, expect } from 'vitest';
import {
  calcularRentabilidade,
  valorEm,
  dropCurrentDay,
  retornoUltimoDia,
} from '../RentabilidadeResumo';

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

  it('início antes da série usa base 0 (retorno total, incluindo o 1º ponto)', () => {
    expect(calcularRentabilidade(serie, day(-9999), day(0))).toBeCloseTo(10, 3);
  });

  it('início NA primeira data usa base 0 — não rebaseia fora o ganho instantâneo do dia 1', () => {
    // Série cujo 1º ponto já carrega -15,3% (ganho/perda instantânea da compra,
    // padrão do calculateHistoricoTWR). "Do início" deve devolver o último valor
    // bruto (-16,44%), igual ao último ponto plotado no gráfico — não
    // (1-0,1644)/(1-0,153)-1 = -1,35%.
    const serieComGanhoInstantaneo = [
      { date: day(-30), value: -15.3 },
      { date: day(-15), value: -16.0 },
      { date: day(-1), value: -16.44 },
    ];
    expect(calcularRentabilidade(serieComGanhoInstantaneo, day(-30), day(0))).toBeCloseTo(
      -16.44,
      3,
    );
  });

  it('início em ponto intermediário mantém a base no último ponto <= borda', () => {
    expect(calcularRentabilidade(serie, day(-180), day(0))).toBeCloseTo(4.7619, 3);
  });

  it('valorInicio 0% não zera o resultado (bug antigo: if(valorInicio===0) return 0)', () => {
    expect(calcularRentabilidade(serie, day(-365), day(0))).toBeCloseTo(10, 3);
  });

  it('série vazia devolve 0', () => {
    expect(calcularRentabilidade([], day(-10), day(0))).toBe(0);
  });
});

// Datas das séries reais são meia-noite UTC (normalizeDateStart no backend) —
// o helper de teste precisa espelhar isso, não a meia-noite local.
const dayUtc = (offsetDias: number): number => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDias);
};

describe('dropCurrentDay', () => {
  it('remove o ponto do dia corrente (parcial)', () => {
    const serie = [
      { date: dayUtc(-2), value: 1 },
      { date: dayUtc(-1), value: 2 },
      { date: dayUtc(0), value: 3 },
    ];
    const out = dropCurrentDay(serie);
    expect(out).toHaveLength(2);
    expect(out[out.length - 1].value).toBe(2);
  });

  it('corta o dia corrente em UTC, não local (em UTC-3 o ponto de hoje 00:00 UTC escapava e o card fechava 1 dia à frente do gráfico)', () => {
    // 00:00 UTC de hoje é ANTES da meia-noite local em UTC-3 (03:00 UTC) —
    // o corte local mantinha esse ponto parcial.
    const serie = [
      { date: dayUtc(-1), value: 2 },
      { date: dayUtc(0), value: 3 },
    ];
    const out = dropCurrentDay(serie);
    expect(out.map((p) => p.value)).toEqual([2]);
  });

  it('mantém a série quando só existe o dia corrente (não zera o card)', () => {
    const serie = [{ date: dayUtc(0), value: 3 }];
    expect(dropCurrentDay(serie)).toHaveLength(1);
  });
});

describe('retornoUltimoDia — último ponto fechado vs o anterior', () => {
  it('compõe os dois últimos pontos da série', () => {
    const serie = [
      { date: dayUtc(-3), value: 0 },
      { date: dayUtc(-2), value: 5 },
      { date: dayUtc(-1), value: 10 },
    ];
    // (1.10/1.05 - 1) = 4.7619%
    expect(retornoUltimoDia(serie)).toBeCloseTo(4.7619, 3);
  });

  it('não devolve 0 fixo em série já sem o dia corrente (regressão: janela [ontem, hoje] resolvia pro mesmo ponto)', () => {
    // Série pós-dropCurrentDay termina ontem; o retorno do último dia fechado
    // deve vir dos DOIS últimos pontos, não da janela [ontem, hoje].
    const serie = [
      { date: dayUtc(-2), value: 2 },
      { date: dayUtc(-1), value: 3 },
    ];
    expect(retornoUltimoDia(serie)).not.toBe(0);
    expect(retornoUltimoDia(serie)).toBeCloseTo((1.03 / 1.02 - 1) * 100, 4);
  });

  it('série com menos de 2 pontos devolve 0', () => {
    expect(retornoUltimoDia([])).toBe(0);
    expect(retornoUltimoDia([{ date: dayUtc(-1), value: 5 }])).toBe(0);
  });
});
