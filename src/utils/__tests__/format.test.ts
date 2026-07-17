import { describe, it, expect } from 'vitest';
import { formatBRL, formatUSD, formatPct, formatPctSigned, formatNumber } from '../format';

// O Intl pt-BR separa símbolo e valor com NBSP (U+00A0).
const NBSP = ' ';

describe('formatBRL', () => {
  it('formata valores positivos com R$, milhar com ponto e decimal com vírgula', () => {
    expect(formatBRL(1234.56)).toBe(`R$${NBSP}1.234,56`);
    expect(formatBRL(0.5)).toBe(`R$${NBSP}0,50`);
    expect(formatBRL(1000000)).toBe(`R$${NBSP}1.000.000,00`);
  });

  it('mantém o sinal em negativos', () => {
    expect(formatBRL(-1234.56)).toBe(`-R$${NBSP}1.234,56`);
  });

  it('formata zero', () => {
    expect(formatBRL(0)).toBe(`R$${NBSP}0,00`);
  });

  it('null/undefined/NaN viram R$ 0,00', () => {
    expect(formatBRL(null)).toBe(`R$${NBSP}0,00`);
    expect(formatBRL(undefined)).toBe(`R$${NBSP}0,00`);
    expect(formatBRL(NaN)).toBe(`R$${NBSP}0,00`);
  });
});

describe('formatUSD', () => {
  it('formata dólar no padrão pt-BR (US$, milhar com ponto, decimal com vírgula)', () => {
    expect(formatUSD(1234.56)).toBe(`US$${NBSP}1.234,56`);
    expect(formatUSD(0.99)).toBe(`US$${NBSP}0,99`);
  });

  it('mantém o sinal em negativos', () => {
    expect(formatUSD(-42.1)).toBe(`-US$${NBSP}42,10`);
  });

  it('null/undefined/NaN viram US$ 0,00', () => {
    expect(formatUSD(null)).toBe(`US$${NBSP}0,00`);
    expect(formatUSD(undefined)).toBe(`US$${NBSP}0,00`);
    expect(formatUSD(NaN)).toBe(`US$${NBSP}0,00`);
  });
});

describe('formatPct', () => {
  it('formata com vírgula e SEM sinal forçado no positivo', () => {
    expect(formatPct(12.34)).toBe('12,34%');
    expect(formatPct(12.345)).toBe('12,35%');
    expect(formatPct(100)).toBe('100,00%');
  });

  it('mantém o "-" em negativos', () => {
    expect(formatPct(-3.2)).toBe('-3,20%');
    expect(formatPct(-0.5)).toBe('-0,50%');
  });

  it('formata zero sem sinal', () => {
    expect(formatPct(0)).toBe('0,00%');
  });

  it('respeita o parâmetro casas', () => {
    expect(formatPct(12.3456, 1)).toBe('12,3%');
    expect(formatPct(12, 0)).toBe('12%');
    expect(formatPct(1.23456, 4)).toBe('1,2346%');
  });

  it('null/undefined/NaN viram 0,00%', () => {
    expect(formatPct(null)).toBe('0,00%');
    expect(formatPct(undefined)).toBe('0,00%');
    expect(formatPct(NaN)).toBe('0,00%');
  });

  it('negativo minúsculo que arredonda para zero não vira "-0,00%"', () => {
    expect(formatPct(-0.0001)).toBe('0,00%');
  });
});

describe('formatPctSigned', () => {
  it('força "+" em positivos e zero (convenção de delta)', () => {
    expect(formatPctSigned(12.34)).toBe('+12,34%');
    expect(formatPctSigned(0)).toBe('+0,00%');
  });

  it('mantém "-" em negativos', () => {
    expect(formatPctSigned(-12.34)).toBe('-12,34%');
  });

  it('null/undefined/NaN viram 0,00% sem sinal', () => {
    expect(formatPctSigned(null)).toBe('0,00%');
    expect(formatPctSigned(undefined)).toBe('0,00%');
    expect(formatPctSigned(NaN)).toBe('0,00%');
  });
});

describe('formatNumber', () => {
  it('formata pt-BR com 2 casas por padrão', () => {
    expect(formatNumber(1234.5)).toBe('1.234,50');
    expect(formatNumber(0.24)).toBe('0,24');
  });

  it('respeita o parâmetro casas', () => {
    expect(formatNumber(1234.5678, 0)).toBe('1.235');
    expect(formatNumber(1.15, 1)).toBe('1,2');
    expect(formatNumber(3.14159, 4)).toBe('3,1416');
  });

  it('mantém o "-" em negativos', () => {
    expect(formatNumber(-1234.56)).toBe('-1.234,56');
  });

  it('null/undefined/NaN viram zero na mesma convenção', () => {
    expect(formatNumber(null)).toBe('0,00');
    expect(formatNumber(undefined)).toBe('0,00');
    expect(formatNumber(NaN)).toBe('0,00');
    expect(formatNumber(null, 0)).toBe('0');
  });

  it('negativo minúsculo que arredonda para zero não vira "-0,00"', () => {
    expect(formatNumber(-0.001)).toBe('0,00');
    expect(formatNumber(-0.4, 0)).toBe('0');
  });
});
