/**
 * Contratos da F0 do fundamentei-regras no schema do criteria_params: campos novos OPCIONAIS (tipo
 * 'cagr', meses.mesReferencia, cagr.baseNaoPositiva, criterios.margem.porPerfil, tamanho por
 * perfil) sem mudar o parse da v1–v4 nem a comparação do seed (isDeepStrictEqual).
 */
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { describe, expect, it } from 'vitest';
import { CRITERIA_PARAMS_V1_JSON } from '../criteriaParamsV1';
import { CRITERIA_PARAMS_V2_JSON } from '../criteriaParamsV2';
import { CRITERIA_PARAMS_V3_JSON } from '../criteriaParamsV3';
import { CRITERIA_PARAMS_V4, CRITERIA_PARAMS_V4_JSON } from '../criteriaParamsV4';
import {
  TAMANHO_LISTA_PERFIL,
  baseNaoPositivaCagrDe,
  criteriaParamsSchema,
  mesReferenciaDe,
  regraMargemDoPerfil,
  type CriteriaParamsEntrada,
} from '../criteriaParamsSchema';
import { validarCriteriaParams } from '../obterCriteriaParams';
import { VERSOES_CODIGO } from '../../../../../scripts/analise-ativos/seed-criteria-params';

const VERSOES: Array<[number, CriteriaParamsEntrada]> = [
  [1, CRITERIA_PARAMS_V1_JSON],
  [2, CRITERIA_PARAMS_V2_JSON],
  [3, CRITERIA_PARAMS_V3_JSON],
  [4, CRITERIA_PARAMS_V4_JSON],
];

/**
 * sha256 de JSON.stringify(parse(vN_JSON)) com o schema de ANTES da F0 (main a2e7c2ff, 20/10/2026).
 * Igual = o motor recebe exatamente os mesmos params (nenhum padrão novo entra no parse).
 */
const HASH_PARSE_ANTES: Record<number, string> = {
  1: '1b310c3a2170c0c409433f76e2d063cb637e82e4a6c2188267bfcad9b805d080',
  2: '2ea797711c8eeb5fb3e8ddb40b19b33eda2d0e450d555bd5790c1d3ddc09cf19',
  3: 'bf3b9b2277ea8e411736445b0a03cab97099aab012f67daf6b64766bb6a45d41',
  4: '0b3a871a081c468ce23b9f86036636bbf69c7e37ef39519e68e0ce5f964269a5',
};

const sha = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const copia = <T>(o: T): T => structuredClone(o);

describe('F0 fundamentei-regras — v1–v4 inalteradas', () => {
  it.each(VERSOES)('v%i: parse byte a byte igual ao de antes da F0', (n, json) => {
    expect(sha(criteriaParamsSchema.parse(json))).toBe(HASH_PARSE_ANTES[n]);
  });

  it.each(VERSOES)('v%i: sem campos novos no parse e padrões de hoje nas leituras', (_n, json) => {
    const p = validarCriteriaParams(json);
    expect('cagr' in p).toBe(false);
    expect('mesReferencia' in p.meses).toBe(false);
    expect('porPerfil' in p.criterios.margem).toBe(false);
    expect(mesReferenciaDe(p)).toBe('pagamento');
    expect(baseNaoPositivaCagrDe(p)).toBe('sem_dado');
    expect(regraMargemDoPerfil(p, 'acao_financeira')).toBe(p.criterios.margem.receitaMenorQueLucro);
    expect(regraMargemDoPerfil(p, 'acao')).toBe(p.criterios.margem.receitaMenorQueLucro);
  });

  it.each(VERSOES)('v%i: o seed acha o JSON gravado equivalente ao código', (n, json) => {
    expect(VERSOES_CODIGO[n].json).toBe(json);
    // como o seed compara: validar(o JSON lido do banco) × validar(o JSON do código)
    const doBanco = validarCriteriaParams(JSON.parse(JSON.stringify(json)));
    const doCodigo = validarCriteriaParams(json);
    expect(
      isDeepStrictEqual(JSON.parse(JSON.stringify(doBanco)), JSON.parse(JSON.stringify(doCodigo))),
    ).toBe(true);
  });

  it('nenhum perfil da v1–v4 usa o tipo nem as séries novas', () => {
    for (const [, json] of VERSOES) {
      const p = criteriaParamsSchema.parse(json);
      const defs = [
        ...p.perfis.acao,
        ...p.perfis.fii_tijolo,
        ...p.perfis.fii_papel,
        ...(p.perfis.stock ?? []),
        ...(p.perfis.reit ?? []),
      ];
      expect(defs.filter((d) => d.tipo === 'cagr')).toEqual([]);
      const series = defs.flatMap((d) => [d.serie, d.serieFallback]);
      for (const s of ['ebit', 'ocf_adjusted_per_share', 'cash_payout_adjusted_pct']) {
        expect(series).not.toContain(s);
      }
    }
  });
});

describe('F0 fundamentei-regras — campos novos aceitos', () => {
  it("tipo 'cagr' sem limite e com as séries novas; com limite é recusado", () => {
    const p = copia(CRITERIA_PARAMS_V4_JSON) as CriteriaParamsEntrada;
    p.perfis.acao = p.perfis.acao.map((c) =>
      c.id === 'ebitda' ? { ...c, tipo: 'cagr', serie: 'ebit' } : c,
    );
    expect(criteriaParamsSchema.safeParse(p).success).toBe(true);
    p.perfis.acao = p.perfis.acao.map((c) => (c.id === 'ebitda' ? { ...c, limite: 0 } : c));
    expect(criteriaParamsSchema.safeParse(p).success).toBe(false);
  });

  it('meses.mesReferencia e cagr.baseNaoPositiva: valores válidos lidos; inválidos recusados', () => {
    const p = copia(CRITERIA_PARAMS_V4_JSON) as CriteriaParamsEntrada;
    p.meses = { ...p.meses, mesReferencia: 'data_com' };
    p.cagr = { baseNaoPositiva: 'fim_positivo' };
    const lido = criteriaParamsSchema.parse(p);
    expect(mesReferenciaDe(lido)).toBe('data_com');
    expect(baseNaoPositivaCagrDe(lido)).toBe('fim_positivo');
    expect(
      criteriaParamsSchema.safeParse({ ...p, meses: { ...p.meses, mesReferencia: 'ex' } }).success,
    ).toBe(false);
    expect(
      criteriaParamsSchema.safeParse({ ...p, cagr: { baseNaoPositiva: 'zero' } }).success,
    ).toBe(false);
    expect(
      criteriaParamsSchema.safeParse({ ...p, cagr: { baseNaoPositiva: 'sem_dado', extra: 1 } })
        .success,
    ).toBe(false);
  });

  it('margem.porPerfil: override só da acao_financeira; ausente = regra global', () => {
    const p = copia(CRITERIA_PARAMS_V4_JSON) as CriteriaParamsEntrada;
    p.criterios = {
      margem: { receitaMenorQueLucro: 'sem_dado', porPerfil: { acao_financeira: 'nao_se_aplica' } },
    };
    const lido = criteriaParamsSchema.parse(p);
    expect(regraMargemDoPerfil(lido, 'acao_financeira')).toBe('nao_se_aplica');
    expect(regraMargemDoPerfil(lido, 'acao')).toBe('sem_dado');
    expect(regraMargemDoPerfil(lido, 'stock_financeira')).toBe('sem_dado');
    // porPerfil vazio = global
    p.criterios = { margem: { receitaMenorQueLucro: 'valor', porPerfil: {} } };
    expect(regraMargemDoPerfil(criteriaParamsSchema.parse(p), 'acao_financeira')).toBe('valor');
    // perfil fora da lista fechada = erro (schema estrito)
    const errado = copia(p) as unknown as {
      criterios: { margem: { porPerfil: Record<string, string> } };
    };
    errado.criterios.margem.porPerfil = { acao: 'valor' };
    expect(criteriaParamsSchema.safeParse(errado).success).toBe(false);
  });

  it('tamanho por perfil: reit aceita 5 ou 6; os demais só 6', () => {
    expect(TAMANHO_LISTA_PERFIL.reit).toEqual({ min: 5, max: 6 });
    const semOcup = copia(CRITERIA_PARAMS_V4_JSON) as CriteriaParamsEntrada;
    semOcup.perfis.reit = (semOcup.perfis.reit ?? []).filter((c) => c.id !== 'ocup');
    expect(semOcup.perfis.reit).toHaveLength(5);
    expect(criteriaParamsSchema.safeParse(semOcup).success).toBe(true);

    const reit4 = copia(semOcup);
    reit4.perfis.reit = (reit4.perfis.reit ?? []).slice(0, 4);
    expect(criteriaParamsSchema.safeParse(reit4).success).toBe(false);

    for (const perfil of ['acao', 'fii_tijolo', 'fii_papel', 'stock'] as const) {
      const p = copia(CRITERIA_PARAMS_V4_JSON) as CriteriaParamsEntrada;
      const lista = p.perfis[perfil] ?? [];
      (p.perfis as Record<string, unknown>)[perfil] = lista.slice(0, 5);
      expect(criteriaParamsSchema.safeParse(p).success, perfil).toBe(false);
    }
  });

  it('a v4 validada continua com o alav do tijolo sobre o ativo (base da v5)', () => {
    const alav = CRITERIA_PARAMS_V4.perfis.fii_tijolo.find((c) => c.id === 'alav');
    expect(alav?.serie).toBe('leverage_assets_pct');
    expect(alav?.limite).toBe(15);
  });
});
