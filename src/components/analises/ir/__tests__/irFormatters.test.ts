import { describe, it, expect } from 'vitest';
import { jcpIrrfRateLabel } from '../irFormatters';

describe('jcpIrrfRateLabel', () => {
  it('retorna 15% até o ano-calendário 2025 (Lei 9.249/95)', () => {
    expect(jcpIrrfRateLabel(2023)).toBe('15%');
    expect(jcpIrrfRateLabel(2024)).toBe('15%');
    expect(jcpIrrfRateLabel(2025)).toBe('15%');
  });

  it('retorna 17,5% a partir de 2026 (LC 224/2025)', () => {
    expect(jcpIrrfRateLabel(2026)).toBe('17,5%');
    expect(jcpIrrfRateLabel(2027)).toBe('17,5%');
  });
});
