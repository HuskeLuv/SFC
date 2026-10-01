import { describe, expect, it } from 'vitest';
import {
  aplicarFatorLpa,
  corrigirEscalaLpa,
  fatorEscalaPorRazao,
  lpaPublicado,
} from '@/services/analiseAtivos/regras/acoes/lpa';
import {
  CNPJ,
  P,
  filtrar,
  lerFixture,
} from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

const dre = lerFixture('dre_lpa_lucro.csv');

describe('lpaPublicado (regra 11)', () => {
  it('BB 2024: o 3.99 "geral" (9,24) é ignorado; vale o 3.99.01.01 ON = 4,62', () => {
    const linhas = filtrar(dre, { cnpj: CNPJ.BBAS3, escopo: 'con' });
    expect(linhas.find((l) => l.cdConta === '3.99')?.valor).toBe(9.24);
    expect(lpaPublicado(linhas)).toEqual({ on: 4.62, pn: null });
  });

  it('VALE3 2024: PNA publicado 0 (classe sem ações) ⇒ null; ON 7,39 cru (sem ×1000 da ESCALA_MOEDA)', () => {
    expect(lpaPublicado(filtrar(dre, { cnpj: CNPJ.VALE3 }))).toEqual({ on: 7.39, pn: null });
  });

  it('KLBN11 2025: ON e PN 0,2286', () => {
    expect(lpaPublicado(filtrar(dre, { cnpj: CNPJ.KLBN11 }))).toEqual({ on: 0.2286, pn: 0.2286 });
  });
});

describe('corrigirEscalaLpa', () => {
  it('ITUB4 2019: LPA publicado 2.780 com 9.745,6 mi de ações e lucro 27.113 mi ⇒ 2,78 (corrigido)', () => {
    const [lpaOn] = [lpaPublicado(filtrar(dre, { cnpj: CNPJ.ITUB4 })).on!];
    expect(lpaOn).toBe(2780);
    const r = corrigirEscalaLpa(lpaOn, 27_113_000_000, 9_745_601_763, P);
    expect(r.corrigido).toBe(true);
    expect(r.lpa.estado === 'ok' && r.lpa.valor).toBeCloseTo(2.78, 6);
  });

  it('razão ≈ 0,001 ⇒ ×1000', () => {
    const r = corrigirEscalaLpa(0.00278, 27_113_000_000, 9_745_601_763, P);
    expect(r.lpa.estado === 'ok' && r.lpa.valor).toBeCloseTo(2.78, 6);
    expect(r.corrigido).toBe(true);
  });

  it('|LPA| > 1000 sem correção possível (razão sem padrão) ⇒ ausente', () => {
    const r = corrigirEscalaLpa(2780, 27_113_000_000, 1_000_000, P);
    expect(r.lpa.estado).toBe('ausente');
    expect(r.corrigido).toBe(false);
  });

  it('LPA coerente fica igual; lucro abaixo do mínimo verificável não corrige', () => {
    expect(corrigirEscalaLpa(1.44026, 6_042_593_000, 4_195_537_378, P)).toEqual({
      lpa: { estado: 'ok', valor: 1.44026 },
      corrigido: false,
    });
    expect(corrigirEscalaLpa(0.5, 500_000, 1_000, P).corrigido).toBe(false);
  });

  it('fatorEscalaPorRazao e aplicarFatorLpa usam as faixas do ScoringParams', () => {
    expect(fatorEscalaPorRazao(1.0, P)).toBe(1);
    expect(fatorEscalaPorRazao(999, P)).toBe(0.001);
    expect(fatorEscalaPorRazao(0.001, P)).toBe(1000);
    expect(fatorEscalaPorRazao(3, P)).toBeNull();
    expect(aplicarFatorLpa(1500, 1, P).lpa.estado).toBe('ausente');
  });
});
