import { describe, it, expect } from 'vitest';
import { evaluateFormula, isFormula } from '../formulaParser';

const ok = (raw: string) => {
  const r = evaluateFormula(raw);
  if (!r.ok) throw new Error(`esperava ok para ${raw}, veio: ${r.error}`);
  return r.value;
};
const fail = (raw: string) => {
  const r = evaluateFormula(raw);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
};

describe('isFormula', () => {
  it('detecta prefixo =', () => {
    expect(isFormula('=1+1')).toBe(true);
    expect(isFormula('  =1+1')).toBe(true);
    expect(isFormula('1+1')).toBe(false);
    expect(isFormula('')).toBe(false);
  });
});

describe('evaluateFormula', () => {
  it('soma do ticket do Pedro', () => {
    expect(ok('=200+30+50+60')).toBe(340);
  });

  it('quatro operações com precedência', () => {
    expect(ok('=2+3*4')).toBe(14);
    expect(ok('=10-4/2')).toBe(8);
    expect(ok('=100/4*2')).toBe(50);
  });

  it('parênteses', () => {
    expect(ok('=(2+3)*4')).toBe(20);
    expect(ok('=((1200-300))/4')).toBe(225);
  });

  it('decimais com vírgula (pt-BR) e ponto', () => {
    expect(ok('=10,5+0,5')).toBe(11);
    expect(ok('=10.5+0.5')).toBe(11);
    expect(ok('=1.234,56+0,44')).toBe(1235);
  });

  it('unários', () => {
    expect(ok('=-10+20')).toBe(10);
    expect(ok('=5*(-2)')).toBe(-10);
    expect(ok('=5*-2')).toBe(-10);
    expect(ok('=-(2+3)')).toBe(-5);
    expect(ok('=+5+5')).toBe(10);
    // Excel aceita unário encadeado: 1+(+2)
    expect(ok('=1++2')).toBe(3);
    expect(ok('=1+-2')).toBe(-1);
  });

  it('espaços e símbolos × ÷', () => {
    expect(ok('= 200 + 30 ')).toBe(230);
    expect(ok('=10×3')).toBe(30);
    expect(ok('=30÷3')).toBe(10);
  });

  it('arredonda a 2 casas (compatível com Decimal(15,2))', () => {
    expect(ok('=10/3')).toBe(3.33);
    expect(ok('=0,1+0,2')).toBe(0.3);
  });

  it('divisão por zero', () => {
    expect(fail('=10/0')).toBe('Divisão por zero');
  });

  it('sintaxe inválida', () => {
    fail('=');
    fail('=(1+2');
    fail('=1+2)');
    fail('=abc+1');
    fail('=1 2');
  });

  it('fórmula longa demais', () => {
    expect(fail('=' + '1+'.repeat(300) + '1')).toBe('Fórmula longa demais');
  });
});
