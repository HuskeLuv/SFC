import { describe, expect, it } from 'vitest';
import { alinharDatasUniao } from '../RentabilidadeChart';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2025, 6, 1);
const d = (n: number) => T0 + n * DAY;

describe('alinharDatasUniao (geometria de datas do chart)', () => {
  it('NUNCA fabrica zeros antes do início de uma série — fora do domínio é null (gap)', () => {
    const res = alinharDatasUniao([
      {
        name: 'CDI',
        data: [
          [d(0), 0],
          [d(1), 0.05],
          [d(2), 0.1],
        ],
      },
      {
        name: 'Carteira',
        data: [
          [d(2), 0],
          [d(3), 1.5],
        ],
      },
    ]);

    const carteira = res.find((s) => s.name === 'Carteira')!;
    // Dias 0 e 1 (antes do 1º ponto da carteira): null, não 0.
    expect(carteira.data[0]).toEqual([d(0), null]);
    expect(carteira.data[1]).toEqual([d(1), null]);
    expect(carteira.data[2]).toEqual([d(2), 0]);
  });

  it('forward-fill só DENTRO do domínio da série (buraco interno herda o último valor)', () => {
    const res = alinharDatasUniao([
      {
        name: 'Carteira',
        data: [
          [d(0), 0],
          [d(3), 2],
        ],
      },
      {
        name: 'CDI',
        data: [
          [d(0), 0],
          [d(1), 0.1],
          [d(2), 0.2],
          [d(3), 0.3],
        ],
      },
    ]);

    const carteira = res.find((s) => s.name === 'Carteira')!;
    expect(carteira.data.map(([, v]) => v)).toEqual([0, 0, 0, 2]); // dias 1-2 herdam o 0
  });

  it('depois do fim do domínio: null (série que terminou não vira linha reta infinita)', () => {
    const res = alinharDatasUniao([
      {
        name: 'Carteira',
        data: [
          [d(0), 0],
          [d(1), 1],
        ],
      },
      {
        name: 'CDI',
        data: [
          [d(0), 0],
          [d(1), 0.1],
          [d(2), 0.2],
        ],
      },
    ]);

    const carteira = res.find((s) => s.name === 'Carteira')!;
    expect(carteira.data[2]).toEqual([d(2), null]);
  });

  it('não existe mais o "trim de 10%": série legítima com muitos zeros no início sobrevive intacta', () => {
    // CDI acumulado 0% por vários dias no início do ano — cenário do checklist mai/28 (#7).
    const zeros = Array.from({ length: 30 }, (_, i) => [d(i), 0] as [number, number]);
    const res = alinharDatasUniao([
      { name: 'CDI', data: [...zeros, [d(30), 0.5]] },
      {
        name: 'Carteira',
        data: [
          [d(0), 0],
          [d(30), 3],
        ],
      },
    ]);

    const cdi = res.find((s) => s.name === 'CDI')!;
    expect(cdi.data).toHaveLength(31);
    expect(cdi.data[0]).toEqual([d(0), 0]);
  });

  it('datas normalizadas pra dia UTC (pontos 00:00Z e 03:00Z do mesmo dia colapsam)', () => {
    const res = alinharDatasUniao([
      {
        name: 'Carteira',
        data: [
          [d(0), 0],
          [d(1) + 3 * 60 * 60 * 1000, 1.2], // 03:00Z do dia 1
        ],
      },
    ]);
    expect(res[0].data.map(([ts]) => ts)).toEqual([d(0), d(1)]);
  });

  it('série sem nenhum valor numérico é descartada', () => {
    const res = alinharDatasUniao([
      { name: 'Vazia', data: [[d(0), null]] },
      { name: 'Ok', data: [[d(0), 0]] },
    ]);
    expect(res.map((s) => s.name)).toEqual(['Ok']);
  });
});
