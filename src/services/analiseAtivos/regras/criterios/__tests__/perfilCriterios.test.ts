import { describe, expect, it } from 'vitest';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import {
  imoveisSobrePlPct,
  observacaoPerfil,
  perfilCriterios,
} from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { FiiTipoTela } from '@/types/analiseAtivosApi';

const P = CRITERIA_PARAMS_V1;
const fii = (fiiTipo: FiiTipoTela | null, imoveisPlPct: number | null) =>
  perfilCriterios({ classe: 'fii', ehFinanceira: false, fiiTipo, imoveisPlPct }, P);

describe('perfilCriterios (regra única)', () => {
  it('ação: ehFinanceira do universo → acao_financeira (D4), senão acao', () => {
    const acao = (ehFinanceira: boolean) =>
      perfilCriterios({ classe: 'acao', ehFinanceira, fiiTipo: null, imoveisPlPct: null }, P);
    expect(acao(true)).toBe('acao_financeira');
    expect(acao(false)).toBe('acao');
  });

  it('FII tijolo e papel diretos (a composição não muda o tipo declarado)', () => {
    expect(fii('tijolo', 10)).toBe('fii_tijolo');
    expect(fii('papel', 90)).toBe('fii_papel');
  });

  it('híbrido: 49% de imóveis → papel; 50% e 51% → tijolo (limiar ≥ 50%)', () => {
    expect(fii('hibrido', 49)).toBe('fii_papel');
    expect(fii('hibrido', 49.99)).toBe('fii_papel');
    expect(fii('hibrido', 50)).toBe('fii_tijolo');
    expect(fii('hibrido', 51)).toBe('fii_tijolo');
  });

  it('FoF cai em papel (cotas de FII não são imóveis), salvo FoF com imóveis ≥ 50%', () => {
    expect(fii('fof', 0)).toBe('fii_papel');
    expect(fii('fof', null)).toBe('fii_papel');
    expect(fii('fof', 51)).toBe('fii_tijolo');
  });

  it('indefinido e sem tipo seguem a mesma regra; sem composição = papel', () => {
    expect(fii('indefinido', 51)).toBe('fii_tijolo');
    expect(fii('indefinido', 49)).toBe('fii_papel');
    expect(fii(null, 70)).toBe('fii_tijolo');
    expect(fii(null, null)).toBe('fii_papel');
  });

  it('o limiar é parametrizável', () => {
    const p = { ...P, regraHibrido: { ...P.regraHibrido, limiarImoveisPlPct: 40 } };
    expect(
      perfilCriterios(
        { classe: 'fii', ehFinanceira: false, fiiTipo: 'hibrido', imoveisPlPct: 45 },
        p,
      ),
    ).toBe('fii_tijolo');
  });
});

describe('imoveisSobrePlPct', () => {
  it('(imóveis + SPE) ÷ PL em %', () => {
    expect(imoveisSobrePlPct({ pl: 1000, imoveis: 400, spe: 110 })).toBeCloseTo(51);
    expect(imoveisSobrePlPct({ pl: 1000, imoveis: 490, spe: null })).toBeCloseTo(49);
  });
  it('sem PL positivo ou sem parcelas = null', () => {
    expect(imoveisSobrePlPct({ pl: 0, imoveis: 10, spe: 0 })).toBeNull();
    expect(imoveisSobrePlPct({ pl: null, imoveis: 10, spe: 0 })).toBeNull();
    expect(imoveisSobrePlPct({ pl: 100, imoveis: null, spe: null })).toBeNull();
  });
});

describe('observacaoPerfil', () => {
  it('FoF avaliado como papel usa o texto registrado', () => {
    expect(observacaoPerfil('fof', 'fii_papel', 'fii')).toBe(TEXTOS_CRITERIOS.perfil.fof);
  });
  it('híbrido e indefinido/sem tipo dizem com quais critérios foram avaliados', () => {
    expect(observacaoPerfil('hibrido', 'fii_tijolo', 'fii')).toBe(
      'híbrido: avaliado com os critérios de tijolo (regra de composição)',
    );
    expect(observacaoPerfil(null, 'fii_papel', 'fii')).toBe(
      'tipo indefinido: avaliado com os critérios de papel (regra de composição)',
    );
  });
  it('tijolo/papel declarados e ações não têm nota', () => {
    expect(observacaoPerfil('tijolo', 'fii_tijolo', 'fii')).toBeNull();
    expect(observacaoPerfil(null, 'acao_financeira', 'acao')).toBeNull();
  });
});
