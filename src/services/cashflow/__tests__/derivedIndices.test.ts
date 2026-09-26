import { describe, expect, it } from 'vitest';
import {
  inflacaoPessoalAnual,
  inflacaoPessoalPorMes,
  peaceIndex,
  savingsIndex,
} from '../derivedIndices';

describe('savingsIndex', () => {
  it('saldo / entradas × 100', () => {
    expect(savingsIndex(250, 1000)).toBe(25);
    expect(savingsIndex(-100, 400)).toBe(-25);
  });
  it('sem entradas → null', () => {
    expect(savingsIndex(100, 0)).toBeNull();
  });
});

describe('peaceIndex', () => {
  it('proventos / despesas fixas × 100', () => {
    expect(peaceIndex(50, 200)).toBe(25);
  });
  it('sem despesas fixas → null', () => {
    expect(peaceIndex(50, 0)).toBeNull();
  });
});

describe('inflação pessoal', () => {
  it('janeiro 0%, variação mês a mês e mês anterior zerado sem cálculo', () => {
    const porMes = inflacaoPessoalPorMes([100, 110, 0, 50, 25]);
    expect(porMes[0]).toBe(0);
    expect(porMes[1]).toBeCloseTo(10);
    expect(porMes[2]).toBe(-100);
    expect(porMes[3]).toBeNull();
    expect(porMes[4]).toBe(-50);
  });
  it('anual = média dos meses com cálculo', () => {
    expect(inflacaoPessoalAnual([0, 10, null, 20])).toBe(10);
    expect(inflacaoPessoalAnual([null, null])).toBeNull();
    expect(inflacaoPessoalAnual([])).toBeNull();
  });
});
