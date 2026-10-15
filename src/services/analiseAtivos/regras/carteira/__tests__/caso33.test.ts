import { describe, expect, it } from 'vitest';
import { desvioAlvo } from '../desvioAlvo';

/**
 * CASO 33 (spec v2.4 §4.5; v2.5 na base ORIGINAL da spec): "Planejar na carteira" — WEGE3 com 120
 * ações a R$ 52,30 (R$ 6.276) = 3,8% da carteira TOTAL, peso-alvo 6% (planning_asset_targets).
 * Base = totalDinheiro do resumo da Carteira = 6.276 ÷ 0,038.
 * Esperado: alvo R$ 9.909 · 189 ações · "posição atual vs. alvo −2,2 p.p. (R$ 3.633 · 69 ações)".
 * Tolerância da spec: 0,005 nos valores monetários e 0,5 nos percentuais inteiros — os valores em
 * R$ são comparados como a tela os mostra (sem centavos).
 */
const PRECO = 52.3;
const QTD = 120;
const POSICAO = QTD * PRECO; // 6.276
const TOTAL = POSICAO / 0.038; // ≈ 165.157,89

describe('caso 33 — base = carteira TOTAL (números originais da spec)', () => {
  const r = desvioAlvo({ valorPosicao: POSICAO, valorBase: TOTAL, alvoPct: 6, preco: PRECO });

  it('posição 3,8% da carteira', () => {
    expect(r.posicaoPct).toBeCloseTo(3.8, 10);
  });

  it('alvo R$ 9.909 e 189 ações', () => {
    expect(Math.round(r.alvoValor!)).toBe(9909);
    expect(r.alvoValor!).toBeCloseTo(0.06 * TOTAL, 10);
    expect(r.alvoQtd).toBe(189);
  });

  it('desvio −2,2 p.p. (R$ 3.633 · 69 ações), na MESMA base', () => {
    expect(r.desvioPp!).toBeCloseTo(-2.2, 10);
    expect(r.desvioPp!).toBeCloseTo(r.posicaoPct - 6, 10);
    expect(Math.round(r.desvioValor!)).toBe(-3633);
    expect(r.desvioValor!).toBeCloseTo(POSICAO - r.alvoValor!, 10);
    expect(r.desvioQtd).toBe(-69);
  });
});

describe('desvioAlvo — bordas', () => {
  it('sem alvo: só a posição; campos de alvo e desvio null', () => {
    expect(desvioAlvo({ valorPosicao: 500, valorBase: 1000, alvoPct: null, preco: 10 })).toEqual({
      posicaoPct: 50,
      alvoValor: null,
      alvoQtd: null,
      desvioPp: null,
      desvioValor: null,
      desvioQtd: null,
    });
  });

  it('sem posição (planejado): desvio = −alvo', () => {
    const r = desvioAlvo({ valorPosicao: 0, valorBase: 20_000, alvoPct: 10, preco: 100 });
    expect(r).toMatchObject({ posicaoPct: 0, alvoValor: 2000, alvoQtd: 20, desvioPp: -10 });
    expect(r.desvioValor).toBe(-2000);
    expect(r.desvioQtd).toBe(-20);
  });

  it('acima do alvo: desvio positivo', () => {
    const r = desvioAlvo({ valorPosicao: 3000, valorBase: 10_000, alvoPct: 25, preco: 10 });
    expect(r.desvioPp).toBeCloseTo(5, 10);
    expect(r.desvioValor).toBeCloseTo(500, 10);
    expect(r.desvioQtd).toBe(50);
  });

  it('no alvo exato: desvio zero sem "−0"', () => {
    const r = desvioAlvo({ valorPosicao: 2500, valorBase: 10_000, alvoPct: 25, preco: 10 });
    expect(r.desvioPp).toBe(0);
    expect(Object.is(r.desvioQtd, -0)).toBe(false);
  });

  it('sem preço: quantidades null; base zerada não divide por zero', () => {
    expect(
      desvioAlvo({ valorPosicao: 100, valorBase: 1000, alvoPct: 5, preco: null }),
    ).toMatchObject({ alvoQtd: null, desvioQtd: null });
    expect(desvioAlvo({ valorPosicao: 0, valorBase: 0, alvoPct: 5, preco: 10 })).toMatchObject({
      posicaoPct: 0,
      alvoValor: 0,
      alvoQtd: 0,
      desvioPp: -5,
    });
  });
});
