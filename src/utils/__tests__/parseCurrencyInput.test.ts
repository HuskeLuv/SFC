import { describe, it, expect } from 'vitest';
import { parseCurrencyInput } from '../parseCurrencyInput';

describe('parseCurrencyInput', () => {
  it('"1.5" é decimal (bug original: virava 15)', () => {
    expect(parseCurrencyInput('1.5')).toBe(1.5);
  });

  it('"1.234" é milhar', () => {
    expect(parseCurrencyInput('1.234')).toBe(1234);
  });

  it('"1.234,56" é milhar + decimal pt-BR', () => {
    expect(parseCurrencyInput('1.234,56')).toBe(1234.56);
  });

  it('"1,5" é decimal pt-BR', () => {
    expect(parseCurrencyInput('1,5')).toBe(1.5);
  });

  it('"1234.56" é decimal en-US', () => {
    expect(parseCurrencyInput('1234.56')).toBe(1234.56);
  });

  it('múltiplos pontos sem vírgula são milhar', () => {
    expect(parseCurrencyInput('1.234.567')).toBe(1234567);
  });

  it('aceita símbolo de moeda e espaços', () => {
    expect(parseCurrencyInput('R$ 1.234,56')).toBe(1234.56);
    expect(parseCurrencyInput(' 1 234,56 ')).toBe(1234.56);
  });

  it('inteiro simples', () => {
    expect(parseCurrencyInput('1234')).toBe(1234);
    expect(parseCurrencyInput('0')).toBe(0);
  });

  it('negativo', () => {
    expect(parseCurrencyInput('-1.234,56')).toBe(-1234.56);
  });

  it('vazio ou não numérico retorna null', () => {
    expect(parseCurrencyInput('')).toBeNull();
    expect(parseCurrencyInput('   ')).toBeNull();
    expect(parseCurrencyInput('abc')).toBeNull();
  });
});
