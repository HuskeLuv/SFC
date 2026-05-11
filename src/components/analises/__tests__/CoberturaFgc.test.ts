import { describe, it, expect } from 'vitest';
import { getStatusLabel } from '../CoberturaFgc';

describe('getStatusLabel', () => {
  it('"Dentro do limite" quando há cobertura abaixo de 80%', () => {
    const s = getStatusLabel(50, 100_000, 0);
    expect(s.text).toBe('Dentro do limite');
    expect(s.tooltip).toBeUndefined();
  });

  it('"Atenção" entre 80% e 100%', () => {
    const s = getStatusLabel(85, 200_000, 0);
    expect(s.text).toBe('Atenção');
  });

  it('"Limite excedido" >= 100%', () => {
    const s = getStatusLabel(120, 300_000, 0);
    expect(s.text).toBe('Limite excedido');
  });

  // Bug #12
  describe('Bug #12 — sem cobertura FGC', () => {
    it('"Sem cobertura FGC" quando totalCoberto=0 e totalNaoCoberto>0', () => {
      const s = getStatusLabel(0, 0, 35_000);
      expect(s.text).toBe('Sem cobertura FGC');
      expect(s.className).toContain('red');
      expect(s.tooltip).toContain('FGC');
      expect(s.tooltip).toMatch(/CRI|CRA|debêntures/);
    });

    it('Se há QUALQUER cobertura positiva, regras de percentual valem (não sinaliza "sem cobertura")', () => {
      // Mesmo um centavo de produto coberto significa que a categoria existe;
      // o badge segue lógica de percentual normal.
      const s = getStatusLabel(0, 0.01, 100);
      expect(s.text).toBe('Dentro do limite');
    });

    it('"Dentro do limite" prevalece se há cobertura mesmo com produtos não-cobertos coexistindo', () => {
      // Ex.: CDB + CRI no mesmo banco → coberto > 0 → segue regra de percentual
      const s = getStatusLabel(30, 75_000, 50_000);
      expect(s.text).toBe('Dentro do limite');
      expect(s.tooltip).toBeUndefined();
    });

    it('totalCoberto=0 e totalNaoCoberto=0 cai no fallback "Dentro do limite"', () => {
      const s = getStatusLabel(0, 0, 0);
      expect(s.text).toBe('Dentro do limite');
    });
  });
});
