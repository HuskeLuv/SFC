import { beforeAll, describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 as P } from '@/services/analiseAtivos/params/scoringParamsV1';

import {
  historicosManuais,
  mapaManuaisVigentes,
} from '@/services/analiseAtivos/fii/tickersManuais';
import {
  casarTickerCnpj,
  conferirPorPlCotacao,
  ehItemFii,
  fundosCandidatos,
  normalizarNomeFundo,
  reconciliarMapa,
  type CasamentoParaMapa,
  type FundoCvm,
  type ItemListaB3,
  type LinhaMapa,
} from '@/services/analiseAtivos/regras/fii/tickerCnpj';
import { CNPJ, jsonFixture, mensalFixture } from './fixturesFii';

let candidatos: FundoCvm[] = [];
let lista: ItemListaB3[] = [];
const semManuais = new Map<string, string>();

beforeAll(async () => {
  const r = await mensalFixture('2026_amostra');
  candidatos = fundosCandidatos(r.geral.values(), r.meses);
  lista = jsonFixture<{ itens: ItemListaB3[] }>('b3-fii-lista-amostra.json').itens;
});
const item = (ac: string) => lista.find((i) => i.acronym === ac)!;
const fundo = (cnpj: string) => candidatos.find((f) => f.cnpj === cnpj)!;

describe('casarTickerCnpj (regra 20)', () => {
  it('BTCI11 (ISIN BRFEXCCTF007) nunca casa pelo prefixo; só pelo manual', () => {
    const semManual = casarTickerCnpj(
      { ...item('BTCI'), isin: 'BRBTCICTF000' },
      candidatos,
      semManuais,
      P,
    );
    expect(semManual.cnpj).toBeNull();
    const comManual = casarTickerCnpj(item('BTCI'), candidatos, mapaManuaisVigentes(), P);
    expect(comManual).toMatchObject({
      ticker: 'BTCI11',
      cnpj: CNPJ.BTCI,
      origem: 'manual',
      conferido: true,
    });
  });

  it('colisão: ISIN completo BRTRXFCTF003 em 2 CNPJs ⇒ ISIN não decide (cai para o nome)', () => {
    expect(candidatos.filter((f) => f.isin === 'BRTRXFCTF003')).toHaveLength(2);
    const r = casarTickerCnpj({ ...item('TRXF'), isin: 'BRTRXFCTF003' }, candidatos, semManuais, P);
    expect(r.origem).toBe('b3_nome');
    expect(r.cnpj).toBe(CNPJ.TRXF);
    expect(r.motivo).toContain('isin_ambiguo');
  });

  it('ISIN completo igual com 1 CNPJ ⇒ b3_isin; sem cotação ⇒ conferido (isin_sem_cotacao)', () => {
    const r = casarTickerCnpj({ ...item('KNRI'), isin: 'BRKNRICTF007' }, candidatos, semManuais, P);
    expect(r).toMatchObject({ cnpj: CNPJ.KNRI, origem: 'b3_isin', conferido: true });
    expect(r.motivo).toContain('isin_sem_cotacao');
  });

  it('b3_nome sem cotação ⇒ não conferido; cotação coerente ⇒ conferido; divergente ⇒ não', () => {
    const k = item('KNRI');
    const semCot = casarTickerCnpj(k, candidatos, semManuais, P);
    expect(semCot).toMatchObject({ cnpj: CNPJ.KNRI, origem: 'b3_nome', conferido: false });
    const vp = fundo(CNPJ.KNRI).pl! / fundo(CNPJ.KNRI).cotas!;
    const ok = casarTickerCnpj(k, candidatos, semManuais, P, new Map([['KNRI11', vp * 0.95]]));
    expect(ok).toMatchObject({
      conferido: true,
      conferencia: 'ok',
      conferidoPor: 'auto_pl_cotacao',
    });
    const div = casarTickerCnpj(k, candidatos, semManuais, P, new Map([['KNRI11', vp * 10]]));
    expect(div).toMatchObject({ conferido: false, conferencia: 'divergente' });
  });

  it('CNPJ informado pela B3 (GetDetailFund) decide: HGLG11 (nome B3 "PÁTRIA LOG")', () => {
    const r = casarTickerCnpj(
      { ...item('HGLG'), cnpjB3: '11728688000147' },
      candidatos,
      semManuais,
      P,
    );
    expect(r).toMatchObject({ cnpj: CNPJ.HGLG, origem: 'b3_cnpj', conferido: true });
  });

  it('FIAGRO/FI-Infra (typeName ≠ FII) nunca entra', () => {
    expect(ehItemFii({ ...item('HGLG'), typeName: 'FIAGRO' })).toBe(false);
    expect(ehItemFii({ ...item('HGLG'), typeName: 'FII' })).toBe(true);
    expect(ehItemFii({ ...item('HGLG'), typeName: null })).toBe(true);
  });

  it('conferirPorPlCotacao: valor de mercado/PL em [0,3; 3]', () => {
    expect(conferirPorPlCotacao(100, 10, 10, P)).toBe('ok');
    expect(conferirPorPlCotacao(100, 10, 2, P)).toBe('divergente');
    expect(conferirPorPlCotacao(100, 10, 31, P)).toBe('divergente');
    expect(conferirPorPlCotacao(100, 10, null, P)).toBe('sem_cotacao');
  });

  it('normalizarNomeFundo tira acentos e palavras genéricas', () => {
    expect(
      normalizarNomeFundo(
        'KINEA RENDA IMOBILIÁRIA FUNDO DE INVESTIMENTO IMOBILIÁRIO RESP. LIMITADA',
      ),
    ).toBe('KINEA RENDA IMOBILIARIA');
    expect(
      normalizarNomeFundo('KINEA RENDIMENTOS IMOBILIARIOS FII RESPONSABILIDADE LIMITADA'),
    ).toBe('KINEA RENDIMENTOS IMOBILIARIOS');
  });
});

const linha = (p: Partial<LinhaMapa> & Pick<LinhaMapa, 'ticker' | 'cnpj'>): LinhaMapa => ({
  id: `id-${p.ticker}`,
  validFrom: '2024-01-01',
  validTo: null,
  origem: 'b3_nome',
  conferido: true,
  conferidoPor: 'auto_pl_cotacao',
  motivo: 'nome_igual',
  nomeB3: null,
  ...p,
});
const casamento = (
  p: Partial<CasamentoParaMapa> & Pick<CasamentoParaMapa, 'ticker' | 'cnpj'>,
): CasamentoParaMapa => ({
  origem: 'b3_nome',
  conferido: true,
  conferidoPor: 'auto_pl_cotacao',
  conferencia: 'ok',
  motivo: 'nome_igual',
  nomeB3: null,
  razaoSocialB3: null,
  isin: null,
  ...p,
});

describe('reconciliarMapa (vigência)', () => {
  it('IRDM11 → IRIM11: fecha a vigência do antigo e abre o novo', () => {
    const mapa = [
      linha({ ticker: 'IRDM11', cnpj: '28.830.325/0001-10' }),
      linha({ ticker: 'KNRI11', cnpj: CNPJ.KNRI }),
      linha({ ticker: 'HGLG11', cnpj: CNPJ.HGLG }),
      linha({ ticker: 'MXRF11', cnpj: CNPJ.MXRF }),
    ];
    const cas = [
      casamento({ ticker: 'IRIM11', cnpj: CNPJ.IRIM, origem: 'manual' }),
      casamento({ ticker: 'KNRI11', cnpj: CNPJ.KNRI }),
      casamento({ ticker: 'HGLG11', cnpj: CNPJ.HGLG }),
      casamento({ ticker: 'MXRF11', cnpj: CNPJ.MXRF }),
    ];
    const p = reconciliarMapa(mapa, cas, '2026-09-30');
    expect(p.fechar).toEqual([{ id: 'id-IRDM11', ticker: 'IRDM11', validTo: '2026-09-29' }]);
    expect(p.abrir).toHaveLength(1);
    expect(p.abrir[0]).toMatchObject({
      ticker: 'IRIM11',
      cnpj: CNPJ.IRIM,
      validFrom: '2026-09-30',
    });
    expect(p.alertas.map((a) => a.codigo)).toEqual(
      expect.arrayContaining(['fii_sigla_nova', 'fii_sigla_sumida']),
    );
    expect(p.atualizar).toHaveLength(0); // nada mudou nos demais
  });

  it('mesmo CNPJ com outra sigla ⇒ alerta fii_sigla_trocada', () => {
    const p = reconciliarMapa(
      [linha({ ticker: 'ABCD11', cnpj: CNPJ.KNRI })],
      [casamento({ ticker: 'WXYZ11', cnpj: CNPJ.KNRI })],
      '2026-09-30',
    );
    expect(p.alertas.map((a) => a.codigo)).toContain('fii_sigla_trocada');
  });

  it('CNPJ do ticker mudou ⇒ fecha e abre (validFrom = hoje)', () => {
    const p = reconciliarMapa(
      [linha({ ticker: 'KNRI11', cnpj: '00.000.000/0001-00' })],
      [casamento({ ticker: 'KNRI11', cnpj: CNPJ.KNRI })],
      '2026-09-30',
    );
    expect(p.fechar[0].validTo).toBe('2026-09-29');
    expect(p.abrir[0]).toMatchObject({
      ticker: 'KNRI11',
      cnpj: CNPJ.KNRI,
      validFrom: '2026-09-30',
    });
  });

  it('universo = lista B3 (regra 27): fundo S na CVM fora da lista não entra', () => {
    expect(fundo(CNPJ.TRXF_COLISAO).bolsa).toBe(true);
    const p = reconciliarMapa([], [casamento({ ticker: 'TRXF11', cnpj: CNPJ.TRXF })], '2026-09-30');
    expect(p.abrir.map((a) => a.cnpj)).toEqual([CNPJ.TRXF]);
  });

  it('backfill: validFrom = 1º mês do CNPJ no informe; históricos manuais entram fechados', () => {
    const p = reconciliarMapa(
      [],
      [casamento({ ticker: 'KNRI11', cnpj: CNPJ.KNRI })],
      '2026-09-30',
      {
        validFromNovo: () => '2016-10-01',
        historicosManuais: historicosManuais(),
      },
    );
    expect(p.abrir.find((a) => a.ticker === 'KNRI11')!.validFrom).toBe('2016-10-01');
    expect(p.abrir.find((a) => a.ticker === 'IRDM11')).toMatchObject({
      cnpj: '28.830.325/0001-10',
      validFrom: '2016-10-01',
      validTo: '2025-10-31',
      origem: 'manual',
    });
  });

  it('sem casamento mantém o vigente; lista B3 truncada não fecha nada', () => {
    const mapa = ['A', 'B', 'C', 'D', 'E'].map((x) => linha({ ticker: `${x}AAA11`, cnpj: x }));
    const p = reconciliarMapa(mapa, [casamento({ ticker: 'AAAA11', cnpj: null })], '2026-09-30');
    expect(p.fechar).toHaveLength(0);
    expect(p.alertas.map((a) => a.codigo)).toContain('fii_lista_b3_truncada');
    expect(p.semCasamento).toEqual(['AAAA11']);
  });

  it('manual nunca é rebaixado por casamento automático', () => {
    const p = reconciliarMapa(
      [linha({ ticker: 'BTCI11', cnpj: CNPJ.BTCI, origem: 'manual', conferidoPor: 'manual:x' })],
      [casamento({ ticker: 'BTCI11', cnpj: CNPJ.BTCI, origem: 'b3_cnpj', motivo: 'cnpj_b3' })],
      '2026-09-30',
    );
    expect(p.atualizar[0]).toMatchObject({ origem: 'manual', conferidoPor: 'manual:x' });
  });
});
