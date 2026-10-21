/**
 * textosEuaEn.ts (F0 fundamentei-regras, A4.d): lista fechada de nomes EUA em inglês, rótulos dos
 * critérios por id/tipo/série/limite e linguagem — nenhum termo de avaliação ou chamada à ação, em
 * português (linguagemV2) nem em inglês (TERMOS_EN_PROIBIDOS). Também os textos novos do REIT
 * ajustado em textosEua.ts e a obs 'sbc_indisponivel' de textosCriterios.ts.
 */
import { describe, expect, it } from 'vitest';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import {
  CODIGOS_EUA_EN,
  CRITERIOS_EUA_EN,
  PLACEHOLDERS_EUA_EN,
  ROTULOS_EUA_EN,
  TERMOS_EN_PROIBIDOS,
  rotuloCriterioEuaEn,
  rotuloEuaEn,
} from '@/services/analiseAtivos/textosEuaEn';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { OBS_CRITERIO } from '@/types/analiseAtivosCriterios';

function folhas(obj: unknown, caminho: string): Array<[string, string]> {
  if (typeof obj === 'string') return [[caminho, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => folhas(v, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => folhas(v, `${caminho}.${k}`));
  }
  return [];
}

const RE_EN_PROIBIDO = new RegExp(`\\b(${TERMOS_EN_PROIBIDOS.join('|')})`, 'i');

const TEXTOS = [
  ...folhas(ROTULOS_EUA_EN, 'ROTULOS_EUA_EN'),
  ...folhas(CRITERIOS_EUA_EN, 'CRITERIOS_EUA_EN'),
  ...folhas(TEXTOS_EUA.reitAjustado, 'TEXTOS_EUA.reitAjustado'),
  ['obs.sbc_indisponivel', TEXTOS_CRITERIOS.obs.sbc_indisponivel],
] as Array<[string, string]>;

describe('textosEuaEn', () => {
  it('lista fechada do desenho (A4.d), na ordem', () => {
    expect(Object.values(ROTULOS_EUA_EN)).toEqual([
      'Revenue',
      'EBITDA',
      'EBIT',
      'Net income',
      'Net margin',
      'Net debt',
      'Net debt/EBITDA',
      'FCF/CAPEX',
      'ROE',
      'EPS (US$)',
      'Dividend/share (US$)',
      'Payout',
      'Operating cash flow',
      'OCF/share (US$)',
      'OCF adj. (SBC)',
      'OCF adj./share (US$)',
      'Payout (÷ OCF adj.)',
      'Div. growing',
      'Profit streak',
      'P/E',
      'P/S',
      'Div. yield',
      // F3: Div./caixa op. sem o ajuste (REIT_FCO_AJUSTADO desligada)
      'Payout (÷ OCF)',
    ]);
  });

  it('F3: todo código das telas EUA aponta para um nome da lista fechada', () => {
    for (const [codigo, chave] of Object.entries(CODIGOS_EUA_EN)) {
      expect(ROTULOS_EUA_EN[chave], codigo).toBeTruthy();
      expect(rotuloEuaEn(codigo)).toBe(ROTULOS_EUA_EN[chave]);
    }
    expect(rotuloEuaEn('fcoAjustadoAcao')).toBe('OCF adj./share (US$)');
    expect(rotuloEuaEn('divFcoAjustadoEua')).toBe('Payout (÷ OCF adj.)');
    expect(rotuloEuaEn('naoExiste')).toBeNull();
  });

  it('linguagem: nada proibido em português (linguagemV2) nem em inglês', () => {
    const achados = TEXTOS.flatMap(([c, t]) => {
      const p = encontrarProibidasV2(t, { ignorarLiterais: true });
      return p.length || RE_EN_PROIBIDO.test(t) ? [`${c}: ${t}`] : [];
    });
    expect(achados).toEqual([]);
    // a varredura EN pega os termos (a F3 leva a lista ao linguagemV2)
    expect(RE_EN_PROIBIDO.test('looks cheap at fair value')).toBe(true);
    expect(RE_EN_PROIBIDO.test('Buy now')).toBe(true);
    expect(RE_EN_PROIBIDO.test('Net debt/EBITDA')).toBe(false);
  });

  it('placeholders só da lista registrada', () => {
    const usados = new Set(
      folhas(CRITERIOS_EUA_EN, '').flatMap(([, t]) =>
        [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
      ),
    );
    for (const p of usados) expect(PLACEHOLDERS_EUA_EN as readonly string[]).toContain(p);
  });

  it('critérios da v5 (cagr, ebit, ajustados) pelos rótulos do desenho', () => {
    const r = (perfil: 'stock' | 'reit', def: Parameters<typeof rotuloCriterioEuaEn>[1]) =>
      rotuloCriterioEuaEn(perfil, def);
    expect(r('stock', { id: 'rec', tipo: 'cagr', serie: 'revenue' })).toBe(
      'Revenue: annual growth > 0',
    );
    expect(r('stock', { id: 'luc', tipo: 'cagr', serie: 'net_income' })).toBe(
      'Net income: annual growth > 0',
    );
    expect(r('stock', { id: 'ebitda', tipo: 'cagr', serie: 'ebit' })).toBe(
      'EBIT: annual growth > 0',
    );
    expect(r('stock', { id: 'mg', tipo: 'pos', serie: 'net_margin' })).toBe('Net margin positive');
    expect(r('stock', { id: 'dl', tipo: 'max', serie: 'net_debt_ebitda', limite: 3 })).toBe(
      'Net debt/EBITDA ≤ 3×',
    );
    expect(r('stock', { id: 'fcl', tipo: 'cagr', serie: 'free_cash_flow' })).toBe(
      'FCF: annual growth > 0',
    );
    expect(r('reit', { id: 'dpa', tipo: 'up', serie: 'dividend_per_share' })).toBe(
      'Dividend/share growing',
    );
    expect(r('reit', { id: 'fco_acao', tipo: 'up', serie: 'ocf_adjusted_per_share' })).toBe(
      'OCF adj./share growing',
    );
    expect(
      r('reit', { id: 'pay', tipo: 'max', serie: 'cash_payout_adjusted_pct', limite: 90 }),
    ).toBe('Payout ≤ 90% of OCF adj.');
    expect(r('reit', { id: 'dl', tipo: 'max', serie: 'net_debt_ebitda', limite: 6 })).toBe(
      'Net debt/EBITDA ≤ 6×',
    );
  });

  it('avaliação v3/v4 (up, EBITDA, sem ajuste) também tem rótulo EN coerente', () => {
    const stock = CRITERIA_PARAMS_V3.perfis.stock ?? [];
    const reit = CRITERIA_PARAMS_V3.perfis.reit ?? [];
    expect(stock.map((d) => rotuloCriterioEuaEn('stock', d))).toEqual([
      'Revenue growing',
      'Net income growing',
      'EBITDA growing',
      'Net margin positive',
      'Net debt/EBITDA ≤ 3×',
      'FCF growing',
    ]);
    expect(reit.map((d) => rotuloCriterioEuaEn('reit', d))).toEqual([
      'Revenue growing',
      'Dividend/share growing',
      'OCF/share growing',
      'Net debt/EBITDA ≤ 6×',
      'Payout ≤ 90% of OCF',
      'Occupancy ≥ 95%',
    ]);
    expect(rotuloCriterioEuaEn('stock_financeira', stock[0])).toBe('Revenue growing');
  });

  it('perfil BR ou combinação fora do mapa = null (fica o rótulo PT)', () => {
    expect(rotuloCriterioEuaEn('acao', { id: 'rec', tipo: 'cagr', serie: 'revenue' })).toBeNull();
    expect(
      rotuloCriterioEuaEn('fii_tijolo', { id: 'mes', tipo: 'months', serie: 'months_with_income' }),
    ).toBeNull();
    expect(rotuloCriterioEuaEn('stock', { id: 'mg', tipo: 'up', serie: 'net_margin' })).toBeNull();
    expect(
      rotuloCriterioEuaEn('reit', {
        id: 'vac',
        tipo: 'max',
        serie: 'vacancy_physical',
        limite: 10,
      }),
    ).toBeNull();
  });

  it("obs 'sbc_indisponivel' registrada com texto", () => {
    expect(OBS_CRITERIO).toContain('sbc_indisponivel');
    expect(TEXTOS_CRITERIOS.obs.sbc_indisponivel).toMatch(/remuneração em ações/);
  });
});
