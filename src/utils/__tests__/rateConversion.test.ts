import { describe, it, expect } from 'vitest';
import { aaToAm, amToAa } from '../rateConversion';

describe('rateConversion', () => {
  it('12% a.a. ≈ 0,9489% a.m.', () => {
    expect(aaToAm(0.12)).toBeCloseTo(0.009489, 6);
  });

  it('1% a.m. ≈ 12,6825% a.a.', () => {
    expect(amToAa(0.01)).toBeCloseTo(0.126825, 6);
  });

  it('são inversas', () => {
    expect(amToAa(aaToAm(0.1565))).toBeCloseTo(0.1565, 10);
  });

  it('taxa zero permanece zero', () => {
    expect(aaToAm(0)).toBe(0);
    expect(amToAa(0)).toBe(0);
  });
});
