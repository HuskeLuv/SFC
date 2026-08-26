import { describe, it, expect } from 'vitest';
import {
  cleanAssetSymbol,
  computePriceDeviationWarning,
  computeSplitScaleHint,
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

  describe('D.3 — mensagem com referenceDate', () => {
    it('cita a data DD/MM/YYYY quando informada (modo histórico)', () => {
      const warning = computePriceDeviationWarning(40, 28, 0.2, '2022-05-11');
      expect(warning).not.toBeNull();
      expect(warning!.message).toContain('em 11/05/2022');
      expect(warning!.message).toContain('R$ 28,00');
    });

    it('mantém "atual" quando referenceDate ausente', () => {
      const warning = computePriceDeviationWarning(40, 28);
      expect(warning).not.toBeNull();
      expect(warning!.message).toContain('fechamento atual');
    });

    it('referenceDate malformado cai no texto sem formatar (não quebra)', () => {
      const warning = computePriceDeviationWarning(40, 28, 0.2, 'data-ruim');
      expect(warning).not.toBeNull();
      expect(warning!.message).toContain('data-ruim');
    });
  });

  // Ticket 26/08: dois testers digitaram o preço da escala ajustada (gráfico)
  // em lançamentos antigos — BBAS3 16,55 (cru 33,13, split 2:1 abr/24) e
  // GGRC11 13,52 (cru 133,33, split 10:1 mar/24).
  describe('computeSplitScaleHint — preço digitado na escala ajustada', () => {
    it('detecta o caso BBAS3 (desdobramento 2:1 posterior à data)', () => {
      const hint = computeSplitScaleHint(16.55, 33.13, [
        { type: 'DESDOBRAMENTO', date: '2024-04-16', factor: 2 },
      ]);
      expect(hint).not.toBeNull();
      expect(hint!.cumFactor).toBe(2);
      expect(hint!.eventsLabel).toBe('desdobramento 2:1 em 16/04/2024');
    });

    it('detecta o caso GGRC11 (desdobramento 10:1) com tolerância de vendor', () => {
      // 13,52 × 10 = 135,20 vs 133,33 → 1,4% de folga, dentro da tolerância
      const hint = computeSplitScaleHint(13.52, 133.33, [
        { type: 'DESDOBRAMENTO', date: '2024-03-06', factor: 10 },
      ]);
      expect(hint).not.toBeNull();
      expect(hint!.eventsLabel).toBe('desdobramento 10:1 em 06/03/2024');
    });

    it('rotula grupamento como 1:N', () => {
      const hint = computeSplitScaleHint(100, 10, [
        { type: 'GRUPAMENTO', date: '2024-01-10', factor: 0.1 },
      ]);
      expect(hint).not.toBeNull();
      expect(hint!.eventsLabel).toBe('grupamento 1:10 em 10/01/2024');
    });

    it('combina múltiplos eventos no label e no fator', () => {
      const hint = computeSplitScaleHint(10, 100, [
        { type: 'DESDOBRAMENTO', date: '2023-05-02', factor: 5 },
        { type: 'DESDOBRAMENTO', date: '2024-05-02', factor: 2 },
      ]);
      expect(hint).not.toBeNull();
      expect(hint!.cumFactor).toBe(10);
      expect(hint!.eventsLabel).toContain(' e ');
    });

    it('null quando a conta não fecha (desvio é outra coisa, ex.: casa decimal)', () => {
      // 2,80 digitado pra fechamento 28,00 com split 2:1 → 2,80×2=5,60 ≠ 28
      expect(
        computeSplitScaleHint(2.8, 28, [{ type: 'DESDOBRAMENTO', date: '2024-04-16', factor: 2 }]),
      ).toBeNull();
    });

    it('null sem eventos, com fator ~1 ou inputs inválidos', () => {
      expect(computeSplitScaleHint(16.55, 33.13, [])).toBeNull();
      expect(computeSplitScaleHint(16.55, 33.13, null)).toBeNull();
      expect(
        computeSplitScaleHint(33, 33.13, [
          { type: 'BONIFICACAO', date: '2024-04-16', factor: 1.01 },
        ]),
      ).toBeNull();
      expect(
        computeSplitScaleHint(0, 33.13, [{ type: 'DESDOBRAMENTO', date: '2024-04-16', factor: 2 }]),
      ).toBeNull();
    });
  });

  describe('cleanAssetSymbol — extrai symbol cru do label do wizard', () => {
    it('extrai o código de um label "SYMBOL - Nome"', () => {
      expect(cleanAssetSymbol('PETR4 - Petrobras')).toBe('PETR4');
      expect(cleanAssetSymbol('HGLG11 - CSHG Logística FII')).toBe('HGLG11');
    });

    it('é idempotente para um symbol já limpo', () => {
      expect(cleanAssetSymbol('PETR4')).toBe('PETR4');
      expect(cleanAssetSymbol('BTC')).toBe('BTC');
    });
  });
});
