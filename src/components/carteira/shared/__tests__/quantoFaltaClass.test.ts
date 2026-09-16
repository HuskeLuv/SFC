import { describe, it, expect } from 'vitest';
import { quantoFaltaClass } from '../quantoFaltaClass';

describe('quantoFaltaClass (cores da coluna Quanto Falta, 16/09/2026)', () => {
  it('azul de 1% para cima', () => {
    expect(quantoFaltaClass(1)).toContain('#0079F2');
    expect(quantoFaltaClass(12.5)).toContain('#0079F2');
  });

  it('âmbar entre 0% e 1% (0,1% a 0,99%)', () => {
    expect(quantoFaltaClass(0.1)).toContain('amber');
    expect(quantoFaltaClass(0.99)).toContain('amber');
    expect(quantoFaltaClass(0.01)).toContain('amber');
  });

  it('vermelho abaixo de 0%', () => {
    expect(quantoFaltaClass(-0.01)).toContain('red');
    expect(quantoFaltaClass(-40)).toContain('red');
  });

  it('sem cor no objetivo exato ou valor inválido', () => {
    expect(quantoFaltaClass(0)).toBe('');
    expect(quantoFaltaClass(null)).toBe('');
    expect(quantoFaltaClass(Number.NaN)).toBe('');
  });
});
