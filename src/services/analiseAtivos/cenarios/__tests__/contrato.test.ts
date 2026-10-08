import { describe, expect, it } from 'vitest';
import {
  CenarioPutSchema,
  FormatoRaioXSchema,
  LIMIAR_TAXA_ADM_ANO_PCT,
  LIMITES_CENARIO,
  MAX_ATIVOS_COMPARADOR,
  MAX_CENARIOS_POR_USUARIO,
  ROTAS_BLOCO_D,
  TICKER_RE,
  nivelFundamentosDaUrl,
  nomeArquivoCsvRaioX,
  queryComNivelFundamentos,
} from '../contrato';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';

const acao = (premissas: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  classe: 'acao',
  premissas: { yieldPct: 6, gPct: 8, kPct: 13, margemPct: 20, ...premissas },
  ...extra,
});
const fii = (premissas: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  classe: 'fii',
  premissas: { yieldPct: 8, margemPct: 10, rendaMensal: 1000, pvpAlvo: 1, ...premissas },
  ...extra,
});
const ok = (body: unknown) => CenarioPutSchema.safeParse(body).success;

describe('contrato do bloco D', () => {
  it('constantes da spec e das decisões', () => {
    expect(MAX_CENARIOS_POR_USUARIO).toBe(300);
    expect(MAX_ATIVOS_COMPARADOR).toBe(4);
    expect(LIMIAR_TAXA_ADM_ANO_PCT).toBe(3);
    // XPLG11 2020 (10,8%) cai na conferência; HGLG11 2025 (0,57%) não
    expect(10.8 > LIMIAR_TAXA_ADM_ANO_PCT).toBe(true);
    expect(0.57 > LIMIAR_TAXA_ADM_ANO_PCT).toBe(false);
    expect(TICKER_RE.test('WEGE3')).toBe(true);
    expect(TICKER_RE.test('TAEE11')).toBe(true);
    expect(TICKER_RE.test('wege3')).toBe(false);
    expect(TICKER_RE.test('WEGE')).toBe(false);
  });

  it('limites lidos do ScoringParams (yield/g/k/margem) + os da spec', () => {
    const p = SCORING_PARAMS_V1.valuation.limites;
    expect(LIMITES_CENARIO.yieldPct).toEqual(p.yieldPct);
    expect(LIMITES_CENARIO.gPct).toEqual(p.gPct);
    expect(LIMITES_CENARIO.kPct).toEqual(p.kPct);
    expect(LIMITES_CENARIO.margemPct).toEqual(p.margemPct);
    expect(LIMITES_CENARIO.margemPasso).toBe(5);
    expect(LIMITES_CENARIO.plAlvo).toEqual([0.1, 200]);
    expect(LIMITES_CENARIO.pvpAlvo).toEqual([0.1, 5]);
    expect(LIMITES_CENARIO.rendaMensal).toEqual([1, 1_000_000]);
    expect(LIMITES_CENARIO.dadoAbsMax).toBe(1e6);
  });

  describe('CenarioPutSchema', () => {
    it('aceita os padrões de ação e de FII, com e sem dados editados', () => {
      expect(ok(acao())).toBe(true);
      expect(ok(acao({ plAlvo: 36.9 }, { dados: { lpa: 1.44 } }))).toBe(true);
      expect(ok(acao({ plAlvo: null }))).toBe(true);
      expect(ok(fii())).toBe(true);
      expect(ok(fii({}, { dados: { rend12m: 1.195, vpCota: 9.8 } }))).toBe(true);
      expect(ok(acao({}, { dados: { lpa: -1.04 } }))).toBe(true); // LPA negativo é dado válido
    });

    it('limites nas bordas (inclusive) e fora', () => {
      expect(ok(acao({ yieldPct: 0.1 }))).toBe(true);
      expect(ok(acao({ yieldPct: 30 }))).toBe(true);
      expect(ok(acao({ yieldPct: 0.09 }))).toBe(false);
      expect(ok(acao({ yieldPct: 45 }))).toBe(false);
      expect(ok(acao({ gPct: -1 }))).toBe(false);
      expect(ok(acao({ gPct: 21 }))).toBe(false);
      expect(ok(acao({ kPct: 0.5 }))).toBe(false);
      expect(ok(acao({ kPct: 31 }))).toBe(false);
      expect(ok(acao({ plAlvo: 0 }))).toBe(false);
      expect(ok(acao({ plAlvo: 201 }))).toBe(false);
      expect(ok(fii({ pvpAlvo: 5 }))).toBe(true);
      expect(ok(fii({ pvpAlvo: 5.1 }))).toBe(false);
      expect(ok(fii({ rendaMensal: 0.5 }))).toBe(false);
      expect(ok(fii({ rendaMensal: 1_000_001 }))).toBe(false);
      expect(ok(acao({}, { dados: { lpa: 1e6 } }))).toBe(true);
      expect(ok(acao({}, { dados: { lpa: 1e6 + 1 } }))).toBe(false);
      expect(ok(acao({}, { dados: { vpa: -1e6 - 1 } }))).toBe(false);
    });

    it('margem só em passos de 5, entre 0 e 50', () => {
      for (const m of [0, 5, 20, 50]) expect(ok(acao({ margemPct: m }))).toBe(true);
      for (const m of [2.5, 7, 55, -5]) expect(ok(acao({ margemPct: m }))).toBe(false);
      expect(ok(fii({ margemPct: 12 }))).toBe(false);
    });

    it('classe errada para as premissas e classe desconhecida', () => {
      // premissas de FII com classe 'acao'
      expect(ok({ classe: 'acao', premissas: fii().premissas })).toBe(false);
      // dados de ação num FII
      expect(ok(fii({}, { dados: { lpa: 1 } }))).toBe(false);
      expect(ok({ ...acao(), classe: 'stock' })).toBe(false);
      expect(ok({ premissas: acao().premissas })).toBe(false);
    });

    it('campo extra é recusado (strict) em todos os níveis', () => {
      expect(ok(acao({}, { extra: 1 }))).toBe(false);
      expect(ok(acao({ rendaMensal: 1000 }))).toBe(false);
      expect(ok(fii({ gPct: 8 }))).toBe(false);
      expect(ok(acao({}, { dados: { cotacao: 50 } }))).toBe(false);
      expect(ok(acao({}, { userId: 'outro' }))).toBe(false);
    });

    it('NaN, Infinity e string (inclusive com vírgula) são recusados', () => {
      expect(ok(acao({ yieldPct: Number.NaN }))).toBe(false);
      expect(ok(acao({ kPct: Number.POSITIVE_INFINITY }))).toBe(false);
      expect(ok(acao({}, { dados: { lpa: Number.NEGATIVE_INFINITY } }))).toBe(false);
      expect(ok(acao({ yieldPct: '6,5' }))).toBe(false);
      expect(ok(acao({ yieldPct: '6' }))).toBe(false);
      expect(ok(fii({ rendaMensal: '1000' }))).toBe(false);
      expect(ok(acao({ yieldPct: null }))).toBe(false);
    });
  });

  it('rotas do Comparador e das APIs', () => {
    expect(ROTAS_BLOCO_D.comparador).toBe('/analise-ativos/comparador');
    expect(ROTAS_BLOCO_D.comparar(['WEGE3'])).toBe('/analise-ativos/comparador?t=WEGE3');
    expect(ROTAS_BLOCO_D.comparar(['WEGE3', 'ITUB4', 'TAEE11'])).toBe(
      '/analise-ativos/comparador?t=WEGE3,ITUB4,TAEE11',
    );
    expect(ROTAS_BLOCO_D.ativoRaioX('WEGE3')).toBe('/analise-ativos/WEGE3?fund=raiox');
    expect(ROTAS_BLOCO_D.api.raioX('WEGE3')).toBe('/api/analise-ativos/ativos/WEGE3/raio-x');
    expect(ROTAS_BLOCO_D.api.raioXCsv('WEGE3')).toBe(
      '/api/analise-ativos/ativos/WEGE3/raio-x?formato=csv',
    );
    expect(ROTAS_BLOCO_D.api.cenarios('HGLG11')).toBe('/api/analise-ativos/cenarios/HGLG11');
    expect(ROTAS_BLOCO_D.api.comparador(['HGLG11', 'XPLG11'])).toBe(
      '/api/analise-ativos/comparador?t=HGLG11,XPLG11',
    );
  });

  it('decisão 13: nível na URL (?fund=raiox) só com o recurso ligado', () => {
    expect(nivelFundamentosDaUrl('raiox', true)).toBe('raioX');
    expect(nivelFundamentosDaUrl('raiox', false)).toBe('essencial');
    expect(nivelFundamentosDaUrl(null, true)).toBe('essencial');
    expect(nivelFundamentosDaUrl('RAIOX', true)).toBe('essencial');
    expect(queryComNivelFundamentos('', 'raioX')).toBe('fund=raiox');
    expect(queryComNivelFundamentos('fund=raiox&x=1', 'essencial')).toBe('x=1');
    expect(queryComNivelFundamentos('x=1', 'raioX')).toBe('x=1&fund=raiox');
  });

  it('decisão 13: nome do CSV raio-x_<TICKER>_<AAAA-MM-DD>.csv; formato json|csv', () => {
    expect(nomeArquivoCsvRaioX('WEGE3', '2026-10-08')).toBe('raio-x_WEGE3_2026-10-08.csv');
    expect(FormatoRaioXSchema.safeParse('csv').success).toBe(true);
    expect(FormatoRaioXSchema.safeParse('json').success).toBe(true);
    expect(FormatoRaioXSchema.safeParse('xlsx').success).toBe(false);
  });
});
