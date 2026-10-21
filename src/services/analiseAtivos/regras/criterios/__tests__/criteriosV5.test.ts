/**
 * fundamentei-regras (F1) — criteria_params v5 pelo caminho do job (FonteCvm com as opções da versão
 * → resolverSeries → avaliarAtivo), com a fixture REAL do DEV (13/10/2026; dado da CVM, nenhum valor
 * de terceiros). Confere a REGRA (denominador, estados, séries usadas), não um número esperado de
 * fora:
 *  - financeiras "n de 3" (rec, luc, mg) e "n de 2" quando o balanço tem receita ≤ lucro (holding
 *    ITSA4, banco no individual ITUB4); a nota no Essencial vem do params;
 *  - ações não financeiras "n de 6", 'ebitda' sobre a série 'ebit' (FY.ebit), 'luc' sem a obs do
 *    lucro descontado;
 *  - FIIs com o 'mes' pelo mês da data-com (fato próprio), alav herdado da v4.
 */
import { describe, expect, it } from 'vitest';
import { seriesDosPerfis } from '@/services/analiseAtivos/calculo/executarCriterios';
import { pontosCvmAcao, pontosCvmFii } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import {
  fontesEfetivas,
  mesReferenciaDe,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V4 } from '@/services/analiseAtivos/params/criteriaParamsV4';
import { CRITERIA_PARAMS_V5 } from '@/services/analiseAtivos/params/criteriaParamsV5';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { perfilCriterios } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import {
  fysVigentesPorAno,
  opcoesSeriesAcaoDoPerfil,
  type BrutoAcao,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import {
  imoveisPlPctFii,
  mesesFii,
  type BrutoFii,
} from '@/services/analiseAtivos/regras/criterios/seriesFii';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';
import type { AvaliacaoAtivo, ResultadoCriterio } from '@/types/analiseAtivosCriterios';
import fixture from './fixtures/dev-2026-10-13.json';

const V5 = CRITERIA_PARAMS_V5;
const ANO_FIM = fixture.anoFim;
const SCORING = { sanidade: { proventos: fixture.proventosParams } } as unknown as ScoringParams;
type AcaoFixture = BrutoAcao & { symbols: string[] };
const ACOES = fixture.acoes as unknown as AcaoFixture[];
const FIIS = fixture.fiis as unknown as BrutoFii[];
const acao = (s: string) => ACOES.find((a) => a.symbols.includes(s)) as AcaoFixture;
const fii = (s: string) => FIIS.find((f) => f.symbol === s) as BrutoFii;

/** O mesmo que o job 'criterios' faz por ação (opções da versão e do perfil). */
function avaliarAcao(symbol: string, P: CriteriaParams = V5): AvaliacaoAtivo {
  const a = acao(symbol);
  const perfil = perfilCriterios(
    { classe: 'acao', ehFinanceira: a.ehFinanceira, fiiTipo: null, imoveisPlPct: null },
    P,
  );
  const series = seriesDosPerfis(P, ['acao']);
  const r = resolverSeries({
    pontos: pontosCvmAcao(a, [symbol], {
      ...opcoesSeriesAcaoDoPerfil(P, perfil),
      incluirEbit: series.includes('ebit'),
    }),
    series,
    fontes: fontesEfetivas(P),
  });
  return avaliarAtivo(
    {
      symbol,
      classe: 'acao',
      perfil,
      anoFim: ANO_FIM,
      series: r.series,
      origens: r.origens,
      meses: null,
    },
    P,
    P.versao,
  );
}

function avaliarFii(f: BrutoFii, P: CriteriaParams = V5): AvaliacaoAtivo {
  const perfil = perfilCriterios(
    { classe: 'fii', ehFinanceira: false, fiiTipo: f.fiiTipo, imoveisPlPct: imoveisPlPctFii(f) },
    P,
  );
  const r = resolverSeries({
    pontos: pontosCvmFii(f, { anoFim: ANO_FIM, scoring: SCORING }),
    series: seriesDosPerfis(P, ['fii_tijolo', 'fii_papel']),
    fontes: fontesEfetivas(P),
  });
  return avaliarAtivo(
    {
      symbol: f.symbol,
      classe: 'fii',
      perfil,
      anoFim: ANO_FIM,
      series: r.series,
      origens: r.origens,
      meses: mesesFii(f, ANO_FIM, SCORING, mesReferenciaDe(P)),
    },
    P,
    P.versao,
  );
}

const res = (a: AvaliacaoAtivo, id: string, j: '3' | '5' | '10' = '5') =>
  a.janelas[j].resultados.find((r) => r.id === id) as ResultadoCriterio;

describe('v5 — financeiras "não se aplica"', () => {
  it('ebitda/dl/fcl não se aplicam a nenhuma financeira da fixture', () => {
    for (const s of ['ITUB4', 'ITSA4', 'BBAS3', 'BBSE3']) {
      const a = avaliarAcao(s);
      expect(a.perfil).toBe('acao_financeira');
      for (const j of ['3', '5', '10'] as const) {
        for (const id of ['ebitda', 'dl', 'fcl'])
          expect(res(a, id, j).estado).toBe('nao_se_aplica');
        expect(res(a, 'ebitda', j).fato).toContain('lucro operacional (EBIT)');
      }
    }
  });

  it('banco com receita > lucro em todos os anos (BBAS3): n de 3 (rec, luc, mg)', () => {
    const j5 = avaliarAcao('BBAS3').janelas['5'];
    expect(j5.resultados.filter((r) => r.estado !== 'nao_se_aplica').map((r) => r.id)).toEqual([
      'rec',
      'luc',
      'mg',
    ]);
    expect(j5.aplicaveis).toBe(3);
  });

  it('holdings (ITSA4, BBSE3) e banco no individual com receita ≤ lucro (ITUB4): n de 2', () => {
    for (const s of ['ITSA4', 'ITUB4', 'BBSE3']) {
      const a = avaliarAcao(s);
      const fy = fysVigentesPorAno(acao(s).fys, acao(s).escopoPreferido);
      const anos = [2021, 2022, 2023, 2024, 2025];
      const receitaNaoComparavel = anos.some((ano) => {
        const f = fy.get(ano);
        return (
          !!f &&
          f.lucroAtribuivel !== null &&
          !(f.receita !== null && f.receita > f.lucroAtribuivel)
        );
      });
      // a fixture do DEV tem ao menos um ano assim nos dois (o teste mostra o porquê do n de 2)
      expect(receitaNaoComparavel).toBe(true);
      expect(res(a, 'mg').estado).toBe('nao_se_aplica');
      expect(res(a, 'mg').fato).toBe(
        'não se aplica a esta instituição financeira: a receita nas demonstrações não é comparável ao lucro (holding de participações ou banco no balanço individual)',
      );
      expect(a.janelas['5'].aplicaveis).toBe(2);
    }
  });

  it('na v4 as mesmas financeiras seguem "n de 6"', () => {
    for (const s of ['ITUB4', 'ITSA4', 'BBAS3', 'BBSE3']) {
      expect(avaliarAcao(s, CRITERIA_PARAMS_V4).janelas['5'].aplicaveis).toBe(6);
    }
  });
});

describe('v5 — ações não financeiras', () => {
  it('WEGE3: n de 6, cagr nos 4 de crescimento, ebitda sobre FY.ebit, luc sem a obs', () => {
    const a = avaliarAcao('WEGE3');
    expect(a.perfil).toBe('acao');
    expect(a.janelas['5'].aplicaveis).toBe(6);
    const fy = fysVigentesPorAno(acao('WEGE3').fys, acao('WEGE3').escopoPreferido);
    const ebit = res(a, 'ebitda');
    // série = FY.ebit em R$ mi, J + 1 pontos (o ano anterior entra)
    expect(ebit.serie?.map((p) => p.ano)).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
    for (const p of ebit.serie ?? []) {
      expect(p.valor).toBeCloseTo((fy.get(p.ano)?.ebit as number) / 1e6, 2);
    }
    for (const id of ['rec', 'luc', 'ebitda', 'fcl']) {
      const r = res(a, id);
      expect(r.estado === 'sem_dado' || /crescimento anual|saiu de/.test(r.fato)).toBe(true);
    }
    expect(res(a, 'luc').obs).toBeUndefined();
    expect(res(a, 'mg')).toEqual(res(avaliarAcao('WEGE3', CRITERIA_PARAMS_V4), 'mg'));
    expect(res(a, 'dl')).toEqual(res(avaliarAcao('WEGE3', CRITERIA_PARAMS_V4), 'dl'));
  });
});

describe('v5 — FIIs', () => {
  it("'mes' pelo mês da data-com (fato próprio) e alav igual ao da v4", () => {
    for (const s of ['HGLG11', 'XPLG11', 'KNCR11', 'MXRF11']) {
      const a = avaliarFii(fii(s));
      const mes = res(a, 'mes');
      if (mes.estado === 'atende' || mes.estado === 'nao_atende') {
        expect(mes.fato).toContain('mês da data-com');
      }
      const a4 = avaliarFii(fii(s), CRITERIA_PARAMS_V4);
      if (a.perfil === 'fii_tijolo') expect(res(a, 'alav')).toEqual(res(a4, 'alav'));
      // os critérios que não mudam saem iguais aos da v4
      for (const id of ['rend', 'vp', 'res']) expect(res(a, id)).toEqual(res(a4, id));
    }
  });
});
