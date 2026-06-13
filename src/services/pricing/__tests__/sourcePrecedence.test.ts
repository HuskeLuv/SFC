import { describe, it, expect } from 'vitest';
import { sourceRank, canOverwrite, normalizeSource } from '../sourcePrecedence';

describe('sourcePrecedence', () => {
  it('normaliza casing (brapi == BRAPI)', () => {
    expect(normalizeSource('brapi')).toBe('BRAPI');
    expect(sourceRank('brapi')).toBe(sourceRank('BRAPI'));
  });

  it('ordena B3 > BRAPI > Yahoo (menor rank = maior prioridade)', () => {
    expect(sourceRank('B3_COTAHIST')).toBeLessThan(sourceRank('BRAPI'));
    expect(sourceRank('BRAPI')).toBeLessThan(sourceRank('YAHOO_FINANCE'));
    expect(sourceRank('MANUAL')).toBeLessThan(sourceRank('B3_COTAHIST'));
  });

  it('fonte desconhecida empata com a BRAPI', () => {
    expect(sourceRank('alguma-coisa')).toBe(sourceRank('BRAPI'));
  });

  it('BRAPI NÃO sobrescreve B3 nem manual', () => {
    expect(canOverwrite('B3_COTAHIST', 'BRAPI')).toBe(false);
    expect(canOverwrite('MANUAL', 'BRAPI')).toBe(false);
  });

  it('B3 sobrescreve BRAPI e Yahoo', () => {
    expect(canOverwrite('BRAPI', 'B3_COTAHIST')).toBe(true);
    expect(canOverwrite('YAHOO_FINANCE', 'B3_COTAHIST')).toBe(true);
  });

  it('empate permite refresh (BRAPI sobre BRAPI / desconhecida)', () => {
    expect(canOverwrite('BRAPI', 'BRAPI')).toBe(true);
    expect(canOverwrite('alguma-coisa', 'BRAPI')).toBe(true);
  });

  it('linha inexistente sempre grava', () => {
    expect(canOverwrite(null, 'YAHOO_FINANCE')).toBe(true);
    expect(canOverwrite('', 'BRAPI')).toBe(true);
    expect(canOverwrite(undefined, 'BRAPI')).toBe(true);
  });
});
