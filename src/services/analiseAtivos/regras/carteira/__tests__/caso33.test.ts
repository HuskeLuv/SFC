import { describe, expect, it } from 'vitest';
import { desvioAlvo } from '../desvioAlvo';

/**
 * CASO 33 (spec v2.4 §4.5, rec. 1): "Planejar na carteira" — WEGE3 com 120 ações a R$ 52,30
 * (R$ 6.276), peso-alvo 6%. A fórmula é UMA só, parametrizada pela base:
 *  - canônico do app: base = valor da ABA (Ações) — posição, alvo e desvio em % de Ações;
 *  - variante: os números literais da spec (base = carteira total de R$ 165.158), para provar que é
 *    a mesma fórmula: alvo R$ 9.909 · 189 ações · desvio −2,2 p.p. (R$ 3.633 · 69 ações).
 * Tolerância da spec: 0,005 nos valores monetários e 0,5 nos percentuais inteiros.
 */
const PRECO = 52.3;
const QTD = 120;
const POSICAO = QTD * PRECO; // 6.276

describe.each([
  {
    nome: 'base = valor da aba Ações (canônico do app)',
    base: 30_766.5,
    alvo: 25,
    // 6.276 ÷ 30.766,5 = 20,4% de Ações; alvo 25% = R$ 7.691,63 → 147 ações; desvio −4,6 p.p.
    esperado: {
      posicaoPct: 20.398,
      alvoValor: 7691.625,
      alvoQtd: 147,
      desvioPp: -4.602,
      desvioValor: -1415.625,
      desvioQtd: -27,
    },
  },
  {
    nome: 'variante literal da spec (base = carteira total)',
    base: 165_158,
    alvo: 6,
    esperado: {
      posicaoPct: 3.8,
      alvoValor: 9909.48,
      alvoQtd: 189,
      desvioPp: -2.2,
      desvioValor: -3633.48,
      desvioQtd: -69,
    },
  },
])('caso 33 — $nome', ({ base, alvo, esperado }) => {
  const r = desvioAlvo({ valorPosicao: POSICAO, valorBaseAba: base, alvoPct: alvo, preco: PRECO });

  it('posição, alvo e desvio na MESMA base', () => {
    expect(r.posicaoPct).toBeCloseTo(esperado.posicaoPct, 2);
    expect(r.alvoValor!).toBeCloseTo(esperado.alvoValor, 2);
    expect(r.desvioPp!).toBeCloseTo(esperado.desvioPp, 2);
    // desvio em p.p. = posição% − alvo% (a mesma base dos dois)
    expect(r.desvioPp!).toBeCloseTo(r.posicaoPct - alvo, 10);
    // desvio em R$ = posição − alvo
    expect(r.desvioValor!).toBeCloseTo(esperado.desvioValor, 2);
    expect(r.desvioValor!).toBeCloseTo(POSICAO - r.alvoValor!, 10);
  });

  it('quantidades pela cotação (alvo para baixo; desvio truncado)', () => {
    expect(r.alvoQtd).toBe(esperado.alvoQtd);
    expect(r.desvioQtd).toBe(esperado.desvioQtd);
  });
});

describe('desvioAlvo — bordas', () => {
  it('sem alvo: só a posição; campos de alvo e desvio null', () => {
    expect(desvioAlvo({ valorPosicao: 500, valorBaseAba: 1000, alvoPct: null, preco: 10 })).toEqual(
      {
        posicaoPct: 50,
        alvoValor: null,
        alvoQtd: null,
        desvioPp: null,
        desvioValor: null,
        desvioQtd: null,
      },
    );
  });

  it('sem posição (planejado): desvio = −alvo', () => {
    const r = desvioAlvo({ valorPosicao: 0, valorBaseAba: 20_000, alvoPct: 10, preco: 100 });
    expect(r).toMatchObject({ posicaoPct: 0, alvoValor: 2000, alvoQtd: 20, desvioPp: -10 });
    expect(r.desvioValor).toBe(-2000);
    expect(r.desvioQtd).toBe(-20);
  });

  it('acima do alvo: desvio positivo', () => {
    const r = desvioAlvo({ valorPosicao: 3000, valorBaseAba: 10_000, alvoPct: 25, preco: 10 });
    expect(r.desvioPp).toBeCloseTo(5, 10);
    expect(r.desvioValor).toBeCloseTo(500, 10);
    expect(r.desvioQtd).toBe(50);
  });

  it('no alvo exato: desvio zero sem "−0"', () => {
    const r = desvioAlvo({ valorPosicao: 2500, valorBaseAba: 10_000, alvoPct: 25, preco: 10 });
    expect(r.desvioPp).toBe(0);
    expect(Object.is(r.desvioQtd, -0)).toBe(false);
  });

  it('sem preço: quantidades null; base zerada não divide por zero', () => {
    expect(
      desvioAlvo({ valorPosicao: 100, valorBaseAba: 1000, alvoPct: 5, preco: null }),
    ).toMatchObject({ alvoQtd: null, desvioQtd: null });
    expect(desvioAlvo({ valorPosicao: 0, valorBaseAba: 0, alvoPct: 5, preco: 10 })).toMatchObject({
      posicaoPct: 0,
      alvoValor: 0,
      alvoQtd: 0,
      desvioPp: -5,
    });
  });
});
