import { describe, it, expect } from 'vitest';
import { round2, distributeRoundedPercents } from '../alocacaoPercents';

describe('round2', () => {
  it('arredonda pra duas casas', () => {
    expect(round2(33.336)).toBe(33.34);
    expect(round2(33.333)).toBe(33.33);
  });

  it('lida com valores inteiros', () => {
    expect(round2(100)).toBe(100);
    expect(round2(0)).toBe(0);
  });

  it('previne lixo de ponto flutuante (ex.: 200 × 156.05)', () => {
    expect(round2(200 * 156.05)).toBe(31210);
  });
});

describe('distributeRoundedPercents', () => {
  it('soma exata = 100 não muda nada', () => {
    const items = [{ percentual: 50 }, { percentual: 50 }];
    expect(distributeRoundedPercents([...items])).toEqual(items);
  });

  it('distribui diff no item de maior percentual quando soma < 100', () => {
    // 3 ativos iguais: round2 dá 33.33 × 3 = 99.99, falta 0.01
    const items = [{ percentual: 33.33 }, { percentual: 33.33 }, { percentual: 33.33 }];
    const result = distributeRoundedPercents(items);
    const sum = result.reduce((s, i) => s + i.percentual, 0);
    expect(sum).toBeCloseTo(100, 2);
  });

  it('subtrai o sobra quando soma > 100', () => {
    const items = [{ percentual: 33.34 }, { percentual: 33.34 }, { percentual: 33.34 }];
    const result = distributeRoundedPercents(items);
    const sum = result.reduce((s, i) => s + i.percentual, 0);
    expect(sum).toBeCloseTo(100, 2);
  });

  it('mantém posição do item de maior percentual', () => {
    const items = [{ percentual: 60 }, { percentual: 20 }, { percentual: 19.99 }];
    const result = distributeRoundedPercents(items);
    expect(result[0].percentual).toBe(60.01);
    expect(result[1].percentual).toBe(20);
    expect(result[2].percentual).toBe(19.99);
  });

  it('retorna lista vazia inalterada', () => {
    expect(distributeRoundedPercents([])).toEqual([]);
  });

  it('lista de soma zero não tenta dividir', () => {
    const items = [{ percentual: 0 }, { percentual: 0 }];
    expect(distributeRoundedPercents([...items])).toEqual(items);
  });

  it('preserva campos extras (T estendido)', () => {
    const items = [
      { percentual: 33.33, ticker: 'A' },
      { percentual: 33.33, ticker: 'B' },
      { percentual: 33.33, ticker: 'C' },
    ];
    const result = distributeRoundedPercents(items);
    expect(result[0].ticker).toBeDefined();
    expect(result[1].ticker).toBeDefined();
    expect(result[2].ticker).toBeDefined();
  });
});
