import { describe, it, expect } from 'vitest';
import {
  CAIXA_ABA_KEYS,
  CATEGORIA_TO_CAIXA_ABA,
  movimentouCaixa,
  planejarDebito,
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
