import { describe, expect, it } from 'vitest';
import { fAx, fAxP, fP, fR, fR0, rotuloMes } from '../formato';

describe('formato (igual ao protótipo)', () => {
  it('fR0 e fR com o menos tipográfico', () => {
    expect(fR0(-1234)).toBe('−R$ 1.234');
    expect(fR0(1234.5)).toBe('R$ 1.235');
    expect(fR0(0)).toBe('R$ 0');
    expect(fR(-1234.5)).toBe('−R$ 1.234,50');
    expect(fR(6151.2)).toBe('R$ 6.151,20');
  });

  it('fP', () => {
    expect(fP(63.5)).toBe('63,5%');
    expect(fP(74.2, 0)).toBe('74%');
    expect(fP(1.061, 3)).toBe('1,061%');
  });

  it('eixos', () => {
    expect(fAx(1_250_000)).toBe('1,25 mi');
    expect(fAx(35_000)).toBe('35 mil');
    expect(fAx(950)).toBe('950');
    expect(fAxP(2.25)).toBe('2,3%');
  });

  it('rotuloMes', () => {
    expect(rotuloMes('2026-11')).toBe('Nov/26');
    expect(rotuloMes('2027-01')).toBe('Jan/27');
  });
});
