/**
 * fundamentei-regras (F1) — job 'criterios-eua' com a criteria_params v5, deps injetadas e a fixture
 * da SEC do DEV (eua-dev.json; dado regulatório, nenhum valor de terceiros). A remuneração em ações
 * (SBC) da fixture é INVENTADA no teste (a ingestão da SBC é da F3): confere-se a regra.
 *  - stock_financeira (JPM): ebitda/dl/fcl 'nao_se_aplica' PRESERVADOS (o job não força mais
 *    'sem dado'), "n de 3";
 *  - reit (O, PLD): "n de 5" (sem 'ocup'); sem SBC em algum ano da janela, fco_acao e pay caem na
 *    série sem ajuste com a obs 'sbc_indisponivel'; com SBC em todos os anos, usam o ajustado;
 *  - stock (AAPL, MSFT): "n de 6", 'ebitda' sobre a série 'ebit' (a base do EBITDA pelo degrau);
 *  - v3 continua como antes (snapshot em regressaoFundamentei.test.ts).
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ajustarFatosEua,
  executarCriteriosEua,
  type DependenciasCriteriosEua,
} from '@/services/analiseAtivos/calculo/executarCriteriosEua';
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V5 } from '@/services/analiseAtivos/params/criteriaParamsV5';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { BrutoSec, FySec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import type { JobContexto } from '@/services/analiseAtivos/tipos';
import type { AvaliacaoAtivo, ResultadoCriterio } from '@/types/analiseAtivosCriterios';
import fixture from '../../regras/criterios/__tests__/fixtures/eua-dev.json';

interface EmpresaFixture {
  symbol: string;
  cik: string;
  classe: 'stock' | 'reit';
  ehFinanceira: boolean;
  sic: number;
  fys: FySec[];
}
const EMPRESAS = fixture.empresas as unknown as EmpresaFixture[];

interface Linha {
  symbol: string;
  janela: number;
  atendidos: number;
  aplicaveis: number;
  resultados: ResultadoCriterio[];
}

async function rodar(
  symbols: string[],
  P: CriteriaParams = CRITERIA_PARAMS_V5,
  sbc: (f: FySec) => number | null | undefined = () => undefined,
): Promise<Linha[]> {
  const capturadas: Linha[] = [];
  const deps: DependenciasCriteriosEua = {
    obterParams: async () => ({ versao: P.versao, params: P }),
    carregarUniverso: async () =>
      symbols.map((s) => {
        const e = EMPRESAS.find((x) => x.symbol === s) as EmpresaFixture;
        return {
          cik: e.cik,
          cikFundamentos: e.cik,
          classe: e.classe,
          ehFinanceira: e.ehFinanceira,
          sic: e.sic,
          symbols: [s],
        };
      }),
    lerBrutos: async (_p, ciks) =>
      new Map(
        ciks.map((cik) => {
          const e = EMPRESAS.find((x) => x.cik === cik);
          const fys = (e?.fys ?? []).map((f) => ({ ...f, remuneracaoAcoes: sbc(f) }));
          return [cik, { cik, fys } satisfies BrutoSec];
        }),
      ),
    gravar: async (_p, linhas) => {
      capturadas.push(...(linhas as unknown as Linha[]));
      return linhas.length;
    },
  };
  const ctx = {
    prisma: {} as PrismaClient,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: () => undefined,
    contar: () => undefined,
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-17',
    origem: 'script',
    aplicar: true,
  } as unknown as JobContexto;
  const r = await executarCriteriosEua(ctx, deps);
  expect(r.pulado).toBeUndefined();
  return capturadas;
}

const linha = (ls: Linha[], s: string, j = 5) =>
  ls.find((l) => l.symbol === s && l.janela === j) as Linha;
const crit = (l: Linha, id: string) => l.resultados.find((r) => r.id === id) as ResultadoCriterio;

describe('criterios-eua com a v5', () => {
  it('a v5 tem os perfis EUA: o job não pula', async () => {
    expect((await rodar(['AAPL'])).length).toBe(3);
  });

  it('stock_financeira (JPM): ebitda/dl/fcl não se aplicam (preservado), n de 3', async () => {
    const ls = await rodar(['JPM']);
    for (const j of [3, 5, 10]) {
      const l = linha(ls, 'JPM', j);
      for (const id of ['ebitda', 'dl', 'fcl']) expect(crit(l, id).estado).toBe('nao_se_aplica');
      expect(l.aplicaveis).toBe(3);
      expect(l.resultados.map((r) => r.id)).toEqual(['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']);
    }
  });

  it('stock (AAPL, MSFT): n de 6, ebitda pela série ebit (sem a D&A)', async () => {
    const ls = await rodar(['AAPL', 'MSFT']);
    for (const s of ['AAPL', 'MSFT']) {
      const l = linha(ls, s);
      expect(l.aplicaveis).toBe(6);
      const e = EMPRESAS.find((x) => x.symbol === s) as EmpresaFixture;
      const ebit = crit(l, 'ebitda');
      for (const p of ebit.serie ?? []) {
        const fy = e.fys.find((f) => f.anoFiscal === p.ano);
        if (p.valor !== null) expect(p.valor).toBeCloseTo((fy?.ebit as number) / 1e6, 2);
      }
      expect(crit(l, 'luc').obs).toBeUndefined();
    }
  });

  it('reit (O, PLD) sem SBC: n de 5 e fco_acao/pay no caixa sem ajuste com sbc_indisponivel', async () => {
    const ls = await rodar(['O', 'PLD']);
    for (const s of ['O', 'PLD']) {
      const l = linha(ls, s);
      expect(l.resultados.map((r) => r.id)).toEqual(['rec', 'dpa', 'fco_acao', 'dl', 'pay']);
      expect(l.aplicaveis).toBe(5);
      for (const id of ['fco_acao', 'pay']) {
        const r = crit(l, id);
        if (r.estado !== 'sem_dado') expect(r.obs).toContain('sbc_indisponivel');
      }
      expect(crit(l, 'rec').fato).toMatch(/crescimento anual|saiu de/);
    }
  });

  it('reit com SBC em todos os anos: usa o caixa ajustado (sem a obs)', async () => {
    // SBC inventada = 2% do FCO
    const ls = await rodar(['O'], CRITERIA_PARAMS_V5, (f) => (f.fco ? f.fco * 0.02 : null));
    const l = linha(ls, 'O');
    const fco = crit(l, 'fco_acao');
    expect(fco.obs).toBeUndefined();
    const e = EMPRESAS.find((x) => x.symbol === 'O') as EmpresaFixture;
    for (const p of fco.serie ?? []) {
      const f = e.fys.find((x) => x.anoFiscal === p.ano) as FySec;
      expect(p.valor).toBeCloseTo(((f.fco as number) * 0.98) / (f.acoesMediaDiluida as number), 3);
    }
    expect(crit(l, 'pay').obs).toBeUndefined();
  });

  it('reit com SBC faltando num ano da janela: a janela inteira cai no sem ajuste', async () => {
    const ls = await rodar(['O'], CRITERIA_PARAMS_V5, (f) =>
      f.anoFiscal === 2023 ? null : (f.fco ?? 0) * 0.02,
    );
    expect(crit(linha(ls, 'O'), 'fco_acao').obs).toContain('sbc_indisponivel');
    // a janela de 3 anos (2023–2025, com o ano anterior 2022) também pega 2023
    expect(crit(linha(ls, 'O', 3), 'fco_acao').obs).toContain('sbc_indisponivel');
  });
});

describe('ajustarFatosEua (v5)', () => {
  const base = (perfil: AvaliacaoAtivo['perfil'], resultados: ResultadoCriterio[]) =>
    ({
      symbol: 'X',
      classe: perfil === 'reit' ? 'reit' : 'stock',
      perfil,
      paramsVersion: 5,
      janelas: {
        '5': {
          janela: 5,
          anoInicio: 2021,
          anoFim: 2025,
          atendidos: 0,
          aplicaveis: 6,
          semDado: false,
          resultados,
        },
      },
    }) as unknown as AvaliacaoAtivo;

  it('não sobrescreve nao_se_aplica da stock_financeira e reconta', () => {
    const nsa = (id: ResultadoCriterio['id']): ResultadoCriterio => ({
      id,
      estado: 'nao_se_aplica',
      n: null,
      de: null,
      fato: 'x',
      motivo: 'instituicao_financeira',
      serie: null,
    });
    const at = (id: ResultadoCriterio['id']): ResultadoCriterio => ({
      id,
      estado: 'atende',
      n: 5,
      de: 5,
      fato: 'y',
      serie: null,
    });
    const a = ajustarFatosEua(
      base('stock_financeira', [
        at('rec'),
        at('luc'),
        nsa('ebitda'),
        at('mg'),
        nsa('dl'),
        nsa('fcl'),
      ]),
      undefined,
    );
    const j = a.janelas['5'];
    expect(j.resultados.filter((r) => r.estado === 'nao_se_aplica').map((r) => r.id)).toEqual([
      'ebitda',
      'dl',
      'fcl',
    ]);
    expect(j).toMatchObject({ atendidos: 3, aplicaveis: 3 });
  });

  it("pay sobre o caixa ajustado ≤ 0: fato 'caixa operacional ajustado ≤ 0 em AAAA'", () => {
    const pay: ResultadoCriterio = {
      id: 'pay',
      estado: 'nao_atende',
      n: 4,
      de: 5,
      fato: 'EBITDA ≤ 0 em 2024',
      motivo: 'ebitda_nao_positivo',
      serie: [2021, 2022, 2023, 2024, 2025].map((ano) => ({ ano, valor: null })),
    };
    const ajustado = { 2024: Number.POSITIVE_INFINITY };
    const a = ajustarFatosEua(base('reit', [pay]), { 2023: Number.POSITIVE_INFINITY }, ajustado);
    expect(a.janelas['5'].resultados[0].fato).toBe('caixa operacional ajustado ≤ 0 em 2024');
    // no fallback (obs sbc_indisponivel) o fato é o do caixa sem ajuste
    const b = ajustarFatosEua(
      base('reit', [{ ...pay, obs: ['sbc_indisponivel'] }]),
      { 2023: Number.POSITIVE_INFINITY },
      ajustado,
    );
    expect(b.janelas['5'].resultados[0].fato).toBe('caixa operacional ≤ 0 em 2023');
  });
});
