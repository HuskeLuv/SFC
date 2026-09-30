import { beforeAll, describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 as P } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  obrigacoesSobrePl,
  parcelasSobrePl,
  reguaFii,
  tipoPorComposicao,
} from '@/services/analiseAtivos/regras/fii/tipoFii';
import type { FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import { CNPJ, mensalFixture, mes } from './fixturesFii';

let meses: FiiMesBruto[] = [];
beforeAll(async () => {
  meses = (await mensalFixture('2026_amostra')).meses;
});
const ago = (cnpj: string) => mes(meses, cnpj, '2026-08-01');

describe('tipoPorComposicao — casos reais (informe mensal ago/2026)', () => {
  it('HGLG11 ⇒ tijolo (imóveis+SPE ≈ 107% do PL)', () => {
    expect(tipoPorComposicao(ago(CNPJ.HGLG), P)).toBe('tijolo');
  });

  it("KNRI11 ⇒ tijolo (legado CVM dizia 'híbrido')", () => {
    expect(tipoPorComposicao(ago(CNPJ.KNRI), P)).toBe('tijolo');
  });

  it('MXRF11 ⇒ papel pela composição (CRI ≈ 72%)', () => {
    expect(tipoPorComposicao(ago(CNPJ.MXRF), P)).toBe('papel');
  });

  it('CPTS11 ⇒ fof (cotas de FII ≈ 94% do PL, CRIs 28%)', () => {
    const m = ago(CNPJ.CPTS);
    expect(parcelasSobrePl(m)!.fofPct).toBeCloseTo(94.3, 1);
    expect(tipoPorComposicao(m, P)).toBe('fof');
  });

  it('KNCR11 ⇒ papel e LCI NÃO soma nos recebíveis (cri exclui LCI/LCA/LH/LIG)', () => {
    const m = ago(CNPJ.KNCR);
    expect(tipoPorComposicao(m, P)).toBe('papel');
    expect((m.cri! / m.pl!) * 100).toBeCloseTo(83.8, 1);
    expect((m.lciLca! / m.pl!) * 100).toBeCloseTo(6.41, 1);
    expect(parcelasSobrePl(m)!.papelPct).toBeCloseTo((m.cri! / m.pl!) * 100, 6);
  });

  it('LCI 12,5% + CRI 40% não vira papel (LCI é caixa)', () => {
    const m = { pl: 100, imoveis: 0, spe: 0, cri: 40, cotasFii: 0 };
    expect(tipoPorComposicao(m, P)).toBe('indefinido');
  });
});

describe('regra do híbrido corrigida', () => {
  it('imóveis+SPE 40% e CRI 30% ⇒ híbrido com régua tijolo', () => {
    const m = { pl: 100, imoveis: 25, spe: 15, cri: 30, cotasFii: 0 };
    expect(tipoPorComposicao(m, P)).toBe('hibrido');
    expect(reguaFii('hibrido', m, P)).toEqual({ regua: 'fii_tijolo', incompleto: false });
  });

  it('imóveis 20% e CRI 35% ⇒ régua papel (nunca "imóveis ≥ 50%" dentro do híbrido)', () => {
    const m = { pl: 100, imoveis: 20, spe: 0, cri: 35, cotasFii: 0 };
    expect(tipoPorComposicao(m, P)).toBe('hibrido');
    expect(reguaFii('hibrido', m, P).regua).toBe('fii_papel');
  });

  it('alavancado com imóveis 55% e CRI 70% do PL ⇒ papel (maior parcela), não tijolo pela ordem', () => {
    expect(tipoPorComposicao({ pl: 100, imoveis: 55, spe: 0, cri: 70, cotasFii: 0 }, P)).toBe(
      'papel',
    );
  });

  it('nenhuma parcela e soma < 50% ⇒ indefinido; PL ≤ 0 ou ausente ⇒ indefinido', () => {
    expect(tipoPorComposicao({ pl: 100, imoveis: 10, spe: 0, cri: 10, cotasFii: 10 }, P)).toBe(
      'indefinido',
    );
    expect(tipoPorComposicao({ pl: -5, imoveis: 90, spe: 0, cri: 0, cotasFii: 0 }, P)).toBe(
      'indefinido',
    );
    expect(tipoPorComposicao({ pl: null, imoveis: 90, spe: 0, cri: 0, cotasFii: 0 }, P)).toBe(
      'indefinido',
    );
    expect(
      tipoPorComposicao({ pl: 100, imoveis: null, spe: null, cri: null, cotasFii: null }, P),
    ).toBe('indefinido');
  });
});

describe('reguaFii', () => {
  const m = { pl: 100, imoveis: 80, spe: 0, cri: 0 };
  it('fof ⇒ fora do Índice (decisão 8)', () => {
    expect(reguaFii('fof', m, P)).toEqual({ regua: 'fora_do_indice', incompleto: false });
  });
  it('indefinido ⇒ régua tijolo marcada incompleta', () => {
    expect(reguaFii('indefinido', m, P)).toEqual({ regua: 'fii_tijolo', incompleto: true });
  });
  it('PL ≤ 0 ⇒ fora do Índice (regra 22), qualquer tipo', () => {
    expect(reguaFii('tijolo', { ...m, pl: 0 }, P).regua).toBe('fora_do_indice');
    expect(reguaFii('papel', { ...m, pl: -1 }, P).regua).toBe('fora_do_indice');
  });
});

describe('obrigacoesSobrePl (decisão 7: "Obrigações/PL")', () => {
  it('TRXF11 ago/26 ≈ 70,3%', () => {
    const v = obrigacoesSobrePl(ago(CNPJ.TRXF));
    expect(v.estado).toBe('ok');
    expect(v.estado === 'ok' && v.valor).toBeCloseTo(70.27, 1);
  });
  it('PL ≤ 0 ⇒ não se aplica; passivo ausente ⇒ ausente; zero é zero', () => {
    expect(obrigacoesSobrePl({ passivoTotal: 10, rendDistribuir: 0, pl: 0 }).estado).toBe(
      'nao_se_aplica',
    );
    expect(obrigacoesSobrePl({ passivoTotal: null, rendDistribuir: 0, pl: 10 }).estado).toBe(
      'ausente',
    );
    expect(obrigacoesSobrePl({ passivoTotal: 5, rendDistribuir: 5, pl: 10 })).toEqual({
      estado: 'ok',
      valor: 0,
    });
  });
});
