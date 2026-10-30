import { describe, it, expect } from 'vitest';
import { cnpjMatriz, cnpjRaiz, formatarCnpj, rotuloCnpj, somenteDigitos } from '../cnpj';

describe('cnpj', () => {
  it('somenteDigitos', () => {
    expect(somenteDigitos('33.264.668/0001-03')).toBe('33264668000103');
    expect(somenteDigitos(null)).toBe('');
  });

  it('cnpjMatriz calcula os dígitos verificadores (módulo 11)', () => {
    expect(cnpjMatriz('00000000')).toBe('00000000000191');
    expect(cnpjMatriz('60701190')).toBe('60701190000104');
    expect(cnpjMatriz('33264668')).toBe('33264668000103');
    expect(() => cnpjMatriz('123')).toThrow();
  });

  it('cnpjRaiz', () => {
    expect(cnpjRaiz('33.264.668/0001-03')).toBe('33264668');
    expect(cnpjRaiz('33264668')).toBe('33264668');
    // perdeu os zeros à esquerda (Banco do Brasil 00.000.000/0001-91)
    expect(cnpjRaiz('191')).toBeNull();
    expect(cnpjRaiz('360305000104')).toBe('00360305');
    expect(cnpjRaiz(null)).toBeNull();
  });

  it('formatarCnpj', () => {
    expect(formatarCnpj('33264668000103')).toBe('33.264.668/0001-03');
    expect(formatarCnpj('33264668')).toBe('33.264.668');
    expect(formatarCnpj('abc')).toBe('abc');
  });

  it('rotuloCnpj: completo quando real, só a raiz quando calculado', () => {
    expect(rotuloCnpj({ cnpj: '33264668000103', cnpjCalculado: false })).toBe(
      'CNPJ 33.264.668/0001-03',
    );
    expect(rotuloCnpj({ cnpj: '33264668000103', cnpjCalculado: true })).toBe('CNPJ 33.264.668');
    expect(rotuloCnpj({ cnpj: null })).toBeNull();
    expect(rotuloCnpj({ cnpj: '', cnpjCalculado: true })).toBeNull();
  });
});
