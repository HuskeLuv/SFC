import { describe, it, expect } from 'vitest';
import {
  CAIXA_ABA_KEYS,
  CATEGORIA_TO_CAIXA_ABA,
  movimentouCaixa,
  planejarDebito,
  planejarDistribuicao,
} from '../caixaParaInvestirPlano';

describe('planejarDebito', () => {
  const caixa = { total: 10000, porAba: { rendaFixa: 3000, acoes: 2000 } };

  it('usa só a reserva da aba quando ela cobre o valor', () => {
    expect(planejarDebito(caixa, 'rendaFixa', 2500)).toEqual({
      daReserva: 2500,
      doLivre: 0,
      coberto: 2500,
      faltou: 0,
      reservaAba: 3000,
      livre: 5000,
    });
  });

  it('esgota a reserva e completa com o livre', () => {
    const plano = planejarDebito(caixa, 'rendaFixa', 5000);
    expect(plano).toMatchObject({ daReserva: 3000, doLivre: 2000, coberto: 5000, faltou: 0 });
  });

  it('nunca usa a reserva de OUTRA aba: livre esgotado vira falta', () => {
    const plano = planejarDebito(caixa, 'rendaFixa', 9000);
    // 3000 da reserva + 5000 livre; os 2000 reservados em Ações ficam intactos.
    expect(plano).toMatchObject({ daReserva: 3000, doLivre: 5000, coberto: 8000, faltou: 1000 });
  });

  it('operação sem aba própria (reserva/imóvel) usa só o livre', () => {
    const plano = planejarDebito(caixa, null, 6000);
    expect(plano).toMatchObject({ daReserva: 0, doLivre: 5000, coberto: 5000, faltou: 1000 });
    expect(plano.reservaAba).toBe(0);
  });

  it('caixa zerado: nada coberto, tudo falta', () => {
    expect(planejarDebito({ total: 0, porAba: {} }, 'acoes', 100)).toMatchObject({
      coberto: 0,
      faltou: 100,
      livre: 0,
    });
  });

  it('dado legado (reservas acima do total): livre é zero, reserva ainda é usada', () => {
    const plano = planejarDebito({ total: 0, porAba: { etf: 4000 } }, 'etf', 1000);
    expect(plano).toMatchObject({ daReserva: 1000, doLivre: 0, livre: 0, faltou: 0 });
  });

  it('arredonda centavos', () => {
    const plano = planejarDebito({ total: 100.1, porAba: { fii: 50.05 } }, 'fii', 80.3);
    expect(plano).toMatchObject({ daReserva: 50.05, doLivre: 30.25, coberto: 80.3, faltou: 0 });
  });
});

describe('CATEGORIA_TO_CAIXA_ABA', () => {
  it('toda aba com reserva tem uma categoria e reservas/imóveis não têm aba', () => {
    const abas = Object.values(CATEGORIA_TO_CAIXA_ABA).filter(Boolean);
    expect(new Set(abas)).toEqual(new Set(CAIXA_ABA_KEYS));
    expect(CATEGORIA_TO_CAIXA_ABA.reservaEmergencia).toBeNull();
    expect(CATEGORIA_TO_CAIXA_ABA.reservaOportunidade).toBeNull();
    expect(CATEGORIA_TO_CAIXA_ABA.imoveisBens).toBeNull();
  });
});

describe('movimentouCaixa', () => {
  const base = {
    aba: null,
    valorOperacao: 100,
    debitoReserva: 0,
    debitoLivre: 0,
    credito: 0,
    deltaTotal: 0,
  };
  it('false quando nada saiu nem entrou', () => {
    expect(movimentouCaixa(null)).toBe(false);
    expect(movimentouCaixa(base)).toBe(false);
  });
  it('true com débito ou crédito', () => {
    expect(movimentouCaixa({ ...base, debitoLivre: 1, deltaTotal: -1 })).toBe(true);
    expect(movimentouCaixa({ ...base, credito: 1, deltaTotal: 1 })).toBe(true);
  });
});

describe('planejarDistribuicao', () => {
  it('livre cobre tudo: cada aba recebe exatamente o que falta e o resto sobra', () => {
    expect(planejarDistribuicao(10000, { acoes: 3000, fii: 1500.5 })).toEqual({
      porAba: { acoes: 3000, fii: 1500.5 },
      distribuido: 4500.5,
      sobra: 5499.5,
    });
  });

  it('livre menor que a necessidade: proporcional ao que falta, soma = livre', () => {
    const plano = planejarDistribuicao(1000, { acoes: 3000, fii: 1000 });
    expect(plano.porAba).toEqual({ acoes: 750, fii: 250 });
    expect(plano.distribuido).toBe(1000);
    expect(plano.sobra).toBe(0);
  });

  it('arredonda em centavos sem passar do livre nem da necessidade de cada aba', () => {
    const plano = planejarDistribuicao(100, { acoes: 1, fii: 1, etf: 1, reit: 0.02 });
    // livre > necessidade → cada uma recebe o que falta
    expect(plano.porAba).toEqual({ acoes: 1, fii: 1, etf: 1, reit: 0.02 });

    const apertado = planejarDistribuicao(0.1, { acoes: 1, fii: 1, etf: 1 });
    const valores = Object.values(apertado.porAba) as number[];
    expect(Math.round(valores.reduce((s, v) => s + v, 0) * 100)).toBe(10);
    expect(apertado.sobra).toBe(0);
    for (const v of valores) expect(v).toBeLessThanOrEqual(1);
  });

  it('sem livre ou sem necessidade não distribui nada', () => {
    expect(planejarDistribuicao(0, { acoes: 100 })).toEqual({
      porAba: {},
      distribuido: 0,
      sobra: 0,
    });
    expect(planejarDistribuicao(-50, { acoes: 100 }).distribuido).toBe(0);
    expect(planejarDistribuicao(500, {})).toEqual({ porAba: {}, distribuido: 0, sobra: 500 });
    expect(planejarDistribuicao(500, { acoes: -10, fii: 0 }).distribuido).toBe(0);
  });
});
