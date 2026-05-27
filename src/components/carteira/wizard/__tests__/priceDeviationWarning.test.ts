import { describe, it, expect } from 'vitest';
import {
  computePriceDeviationWarning,
  DEFAULT_PRICE_DEVIATION_THRESHOLD,
  CRYPTO_PRICE_DEVIATION_THRESHOLD,
} from '../priceDeviationWarning';

/**
 * F1.7 — alerta visual quando preço digitado no Step4 divirja >20% do
 * fechamento atual. Pega erro típico de UX: digitar R$ 2,80 quando o real
 * era R$ 28,00 (~90% de divergência).
 */
describe('computePriceDeviationWarning', () => {
  describe('no-op cases (sem warning)', () => {
    it('retorna null quando enteredPrice é 0 (campo vazio)', () => {
      expect(computePriceDeviationWarning(0, 28)).toBeNull();
    });

    it('retorna null quando enteredPrice é null', () => {
      expect(computePriceDeviationWarning(null, 28)).toBeNull();
    });

    it('retorna null quando enteredPrice é undefined', () => {
      expect(computePriceDeviationWarning(undefined, 28)).toBeNull();
    });

    it('retorna null quando currentPrice é null (asset sem cotação)', () => {
      expect(computePriceDeviationWarning(25, null)).toBeNull();
    });

    it('retorna null quando currentPrice é undefined', () => {
      expect(computePriceDeviationWarning(25, undefined)).toBeNull();
    });

    it('retorna null quando enteredPrice é negativo', () => {
      expect(computePriceDeviationWarning(-5, 28)).toBeNull();
    });

    it('retorna null quando enteredPrice é NaN', () => {
      expect(computePriceDeviationWarning(Number.NaN, 28)).toBeNull();
    });

    it('retorna null quando divergência fica em 19% (abaixo do threshold)', () => {
      // 28 * 1.19 = 33.32; |33.32-28|/28 = 0.19 — abaixo do limite (0.2).
      expect(computePriceDeviationWarning(33.32, 28)).toBeNull();
    });

    it('retorna null quando divergência fica abaixo do threshold (15%)', () => {
      expect(computePriceDeviationWarning(32.2, 28)).toBeNull();
    });
  });

  describe('disparo de warning', () => {
    it('detecta erro de casa decimal (preço 10x menor)', () => {
      // R$ 2,80 quando o real era R$ 28,00 → ~90% abaixo
      const w = computePriceDeviationWarning(2.8, 28);
      expect(w).not.toBeNull();
      expect(w?.direction).toBe('abaixo');
      expect(w?.ratio).toBeGreaterThan(0.8);
      expect(w?.message).toContain('90,0%');
      expect(w?.message).toContain('abaixo');
      expect(w?.message).toContain('28,00');
    });

    it('detecta erro de casa decimal (preço 10x maior)', () => {
      const w = computePriceDeviationWarning(280, 28);
      expect(w).not.toBeNull();
      expect(w?.direction).toBe('acima');
      expect(w?.message).toContain('acima');
      expect(w?.message).toContain('28,00');
    });

    it('dispara apenas quando passa de 20% (21%)', () => {
      const w = computePriceDeviationWarning(28 * 1.21, 28);
      expect(w).not.toBeNull();
      expect(w?.direction).toBe('acima');
    });

    it('inclui dica de casa decimal na mensagem', () => {
      const w = computePriceDeviationWarning(2.8, 28);
      expect(w?.message).toMatch(/casa decimal/i);
    });
  });

  describe('threshold customizado (cripto)', () => {
    it('não alerta volatilidade típica de cripto (30%) com threshold 50%', () => {
      expect(
        computePriceDeviationWarning(150_000 * 1.3, 150_000, CRYPTO_PRICE_DEVIATION_THRESHOLD),
      ).toBeNull();
    });

    it('alerta erro grosseiro em cripto (>50%) mesmo com threshold relaxado', () => {
      // R$ 15.000 vs R$ 150.000 = 90% abaixo (claro typo de casa decimal)
      const w = computePriceDeviationWarning(15_000, 150_000, CRYPTO_PRICE_DEVIATION_THRESHOLD);
      expect(w).not.toBeNull();
      expect(w?.direction).toBe('abaixo');
    });

    it('threshold default permanece em 20%', () => {
      expect(DEFAULT_PRICE_DEVIATION_THRESHOLD).toBe(0.2);
    });
  });
});
