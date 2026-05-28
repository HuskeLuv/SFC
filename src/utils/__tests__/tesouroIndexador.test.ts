import { describe, it, expect } from 'vitest';
import { inferIndexerFromDescricao } from '../tesouroIndexador';

describe('inferIndexerFromDescricao', () => {
  it('Tesouro Selic → CDI', () => {
    expect(inferIndexerFromDescricao('Tesouro Selic 2029')).toBe('CDI');
    expect(inferIndexerFromDescricao('TESOURO SELIC 2025')).toBe('CDI');
  });

  it('Tesouro IPCA+ → IPCA', () => {
    expect(inferIndexerFromDescricao('Tesouro IPCA+ 2035')).toBe('IPCA');
    expect(inferIndexerFromDescricao('Tesouro IPCA+ com Juros Semestrais 2040')).toBe('IPCA');
  });

  it('Tesouro Renda+ → IPCA', () => {
    expect(inferIndexerFromDescricao('Tesouro Renda+ Aposentadoria Extra 2040')).toBe('IPCA');
    expect(inferIndexerFromDescricao('Tesouro Renda + 2050')).toBe('IPCA');
  });

  it('Tesouro Educa+ → IPCA', () => {
    expect(inferIndexerFromDescricao('Tesouro Educa+ 2035')).toBe('IPCA');
  });

  it('Tesouro Prefixado → PRE', () => {
    expect(inferIndexerFromDescricao('Tesouro Prefixado 2030')).toBe('PRE');
    expect(inferIndexerFromDescricao('Tesouro Prefixado com Juros Semestrais 2035')).toBe('PRE');
  });

  it('aceita "pré" (com acento)', () => {
    expect(inferIndexerFromDescricao('Título pré 2030')).toBe('PRE');
  });

  it('retorna null pra string vazia ou não-tesouro', () => {
    expect(inferIndexerFromDescricao('')).toBeNull();
    expect(inferIndexerFromDescricao('CDB Banco X 2027')).toBeNull();
    expect(inferIndexerFromDescricao('Random text')).toBeNull();
  });
});
