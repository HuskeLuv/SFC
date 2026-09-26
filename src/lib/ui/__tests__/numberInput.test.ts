import { describe, expect, it } from 'vitest';
import { formatDecimalInput, parseDecimalInput } from '../numberInput';

describe('parseDecimalInput', () => {
  it('pt-BR: vírgula decimal e ponto de milhar', () => {
    expect(parseDecimalInput('12,5')).toBe(12.5);
    expect(parseDecimalInput('1.234,56')).toBe(1234.56);
    expect(parseDecimalInput('R$ 1.234.567,8')).toBe(1234567.8);
    expect(parseDecimalInput('7%')).toBe(7);
  });

  it('pt-BR sem vírgula: pontos em grupos de 3 são milhar (campo aberto como 1.234,50 sem os centavos)', () => {
    expect(parseDecimalInput('1.234')).toBe(1234);
    expect(parseDecimalInput('15.000')).toBe(15000);
    expect(parseDecimalInput('R$ 1.234.567')).toBe(1234567);
    expect(parseDecimalInput('10')).toBe(10);
  });

  it('pt-BR sem vírgula: outro ponto é decimal', () => {
    expect(parseDecimalInput('3.5')).toBe(3.5);
    expect(parseDecimalInput('1234.56')).toBe(1234.56);
    expect(parseDecimalInput('0.14499999')).toBe(0.14499999);
  });

  it('en-US: vírgula de milhar e ponto decimal', () => {
    expect(parseDecimalInput('1,234.56', 'en-US')).toBe(1234.56);
    expect(parseDecimalInput('12.5', 'en-US')).toBe(12.5);
  });

  it("aceita '-' e '−' (U+2212)", () => {
    expect(parseDecimalInput('−3')).toBe(-3);
    expect(parseDecimalInput('-3,5')).toBe(-3.5);
    expect(parseDecimalInput('R$ −1.000,00')).toBe(-1000);
  });

  it('vazio ou não numérico → null', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('   ')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('-')).toBeNull();
    expect(parseDecimalInput(',')).toBeNull();
  });
});

describe('formatDecimalInput', () => {
  it('formata por locale e casas', () => {
    expect(formatDecimalInput(1234.5)).toBe('1.234,50');
    expect(formatDecimalInput(1234.5, 'en-US')).toBe('1,234.50');
    expect(formatDecimalInput(3, 'pt-BR', 0)).toBe('3');
  });

  it('null/NaN → vazio', () => {
    expect(formatDecimalInput(null)).toBe('');
    expect(formatDecimalInput(Number.NaN)).toBe('');
  });
});
