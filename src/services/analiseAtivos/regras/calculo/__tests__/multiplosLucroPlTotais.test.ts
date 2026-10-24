/**
 * fundamentei-regras (24/10/2026): multiplos.lucroPlTotais — lucro e PL TOTAIS (com minoritários) em
 * LPA, VPA, P/L, P/VP, ROE, DL/PL e no payout de caixa. Desligada (v1–v4) = atribuível/controladora.
 */
import { describe, expect, it } from 'vitest';
import {
  multiplosAnuais,
  payoutCaixaPct,
  type BaseFundamentos,
} from '@/services/analiseAtivos/regras/calculo/multiplos';
import { ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { ScoringParams, Valor } from '@/services/analiseAtivos/tipos';
import { P } from './helpers';

const val = (x: Valor<number> | undefined) => (x && x.estado === 'ok' ? x.valor : NaN);

function fund(parcial: Partial<BaseFundamentos>): BaseFundamentos {
  return {
    receita: 5000,
    lucroLiquido: null,
    lucroAtribuivel: null,
    ebit: 900,
    depreciacaoAmortizacao: 100,
    ativoTotal: 10000,
    ativoCirculante: null,
    passivoCirculante: null,
    caixa: 100,
    aplicacoesFinanceiras: 0,
    dividaBrutaCp: 300,
    dividaBrutaLp: 400,
    pl: null,
    plControladora: null,
    fco: null,
    capex: null,
    naoSeAplica: [],
    flags: [],
    ...parcial,
  };
}

// EQTL3-like: minoritários relevantes (lucro total 600 × atribuível 360; PL total 9.000 × 6.000)
const F = fund({ lucroLiquido: 600, lucroAtribuivel: 360, pl: 9000, plControladora: 6000 });
const entrada = (f: BaseFundamentos) => ({
  classe: 'acao' as const,
  preco: 20,
  acoesTotais: 1000,
  fatorEquivalencia: 1,
  valorMercadoEmpresa: null,
  fund: f,
  dpa: ok(0.5),
  ehFinanceira: false,
});
const comRegra = (ligada: boolean): ScoringParams => ({
  ...P,
  multiplos: { lucroPlTotais: ligada },
});

describe('multiplos.lucroPlTotais', () => {
  it('desligada: lucro atribuível e PL da controladora (hoje)', () => {
    const m = multiplosAnuais(entrada(F), P);
    expect(val(m.lpa)).toBeCloseTo(0.36, 6);
    expect(val(m.pl)).toBeCloseTo(20 / 0.36, 6);
    expect(val(m.roePct)).toBeCloseTo(6, 6);
    expect(val(m.vpa)).toBeCloseTo(6, 6);
    expect(val(m.divLiqPl)).toBeCloseTo(600 / 6000, 6);
    expect(multiplosAnuais(entrada(F), comRegra(false))).toEqual(m);
  });

  it('ligada: lucro e PL totais (como o Fundamentei); ROE = lucro ÷ PL do fim do período', () => {
    const m = multiplosAnuais(entrada(F), comRegra(true));
    expect(val(m.lpa)).toBeCloseTo(0.6, 6);
    expect(val(m.pl)).toBeCloseTo(20 / 0.6, 6);
    expect(val(m.vpa)).toBeCloseTo(9, 6);
    expect(val(m.pvp)).toBeCloseTo(20 / 9, 6);
    expect(val(m.roePct)).toBeCloseTo((600 / 9000) * 100, 6);
    expect(val(m.divLiqPl)).toBeCloseTo(600 / 9000, 6);
  });

  it('ligada sem o total: cai no atribuível/controladora', () => {
    const m = multiplosAnuais(
      entrada(fund({ lucroAtribuivel: 360, plControladora: 6000 })),
      comRegra(true),
    );
    expect(val(m.lpa)).toBeCloseTo(0.36, 6);
    expect(val(m.roePct)).toBeCloseTo(6, 6);
  });

  it('payout de caixa: DFC ÷ lucro total com a regra; prejuízo total ⇒ ausente prejuizo', () => {
    const f = { ...F, dividendosJcpPagos: 300 };
    expect(val(payoutCaixaPct(f))).toBeCloseTo((300 / 360) * 100, 6);
    expect(val(payoutCaixaPct(f, true))).toBeCloseTo(50, 6);
    expect(payoutCaixaPct({ ...f, lucroLiquido: -10 }, true)).toEqual({
      estado: 'ausente',
      motivo: 'outro',
      detalhe: 'prejuizo',
    });
  });
});
