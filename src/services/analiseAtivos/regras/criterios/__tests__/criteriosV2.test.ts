/**
 * v2.5 — regras da spec do Pedro com o criteria_params v2, de ponta a ponta pelo caminho do job
 * (FonteCvm → resolverSeries → avaliarAtivo), com a fixture REAL do DEV (13/10/2026):
 *  - financeiras "n de 6": EBITDA/Dív.EBITDA de banco/seguradora sem dado (layout bancário), holding
 *    de layout industrial (ITSA4) com EBITDA calculado; margem com receita < lucro = valor
 *    (literal) ou sem dado (religável); margemSemReceitaComparavel religa o n/a;
 *  - lucro descontado: sem o descontado na fonte, a janela inteira usa o lucro líquido com a obs;
 *  - FII: vacância da CVM avaliada (tijolo com dado; papel nsa = sem dado), inadimplência e LTV sem
 *    fonte = "não atende · sem dado", alavancagem = leverage_pct, janela 10 com o texto simples;
 *  - agregação anual 'ultimo' (o último trimestre do ano).
 * Os valores esperados por ativo são os da fixture (achado baixo do desenho: não supor nulo).
 */
import { describe, expect, it } from 'vitest';
import { seriesDosPerfis } from '@/services/analiseAtivos/calculo/executarCriterios';
import { pontosCvmAcao, pontosCvmFii } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import {
  criteriaParamsSchema,
  fontesEfetivas,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import {
  CRITERIA_PARAMS_V2,
  CRITERIA_PARAMS_V2_JSON,
} from '@/services/analiseAtivos/params/criteriaParamsV2';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { perfilCriterios } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import {
  opcoesSeriesAcao,
  type BrutoAcao,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import {
  imoveisPlPctFii,
  mesesFii,
  vacanciaTrimestralFii,
  type BrutoFii,
} from '@/services/analiseAtivos/regras/criterios/seriesFii';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';
import type {
  AvaliacaoAtivo,
  EstadoCriterio,
  ResultadoCriterio,
} from '@/types/analiseAtivosCriterios';
import fixture from './fixtures/dev-2026-10-13.json';

const V2 = CRITERIA_PARAMS_V2;
const ANO_FIM = fixture.anoFim;
const SCORING = { sanidade: { proventos: fixture.proventosParams } } as unknown as ScoringParams;
type AcaoFixture = BrutoAcao & { symbols: string[] };
const ACOES = fixture.acoes as unknown as AcaoFixture[];
const FIIS = fixture.fiis as unknown as BrutoFii[];

const acao = (s: string) => ACOES.find((a) => a.symbols.includes(s)) as AcaoFixture;
const fii = (s: string) => FIIS.find((f) => f.symbol === s) as BrutoFii;

/** v2 com ajustes (religar regras por params, sem código). */
function v2Com(ajuste: (j: Record<string, unknown>) => void): CriteriaParams {
  const json = structuredClone(CRITERIA_PARAMS_V2_JSON) as unknown as Record<string, unknown>;
  ajuste(json);
  return criteriaParamsSchema.parse(json);
}

function avaliarAcao(symbol: string, P: CriteriaParams = V2): AvaliacaoAtivo {
  const a = acao(symbol);
  const perfil = perfilCriterios(
    { classe: 'acao', ehFinanceira: a.ehFinanceira, fiiTipo: null, imoveisPlPct: null },
    P,
  );
  const r = resolverSeries({
    pontos: pontosCvmAcao(a, [symbol], opcoesSeriesAcao(P)),
    series: seriesDosPerfis(P, ['acao']),
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

function avaliarFii(f: BrutoFii, P: CriteriaParams = V2): AvaliacaoAtivo {
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
      meses: mesesFii(f, ANO_FIM, SCORING),
    },
    P,
    P.versao,
  );
}

const res = (a: AvaliacaoAtivo, id: string, j: '3' | '5' | '10' = '5') =>
  a.janelas[j].resultados.find((r) => r.id === id) as ResultadoCriterio;
const estado = (a: AvaliacaoAtivo, id: string, j: '3' | '5' | '10' = '5'): EstadoCriterio =>
  res(a, id, j).estado;

/** HGLG11 com vacância física trimestral (tijolo); KNCR11 papel com a flag nsa. */
function comVacancia(f: BrutoFii, vac: (refQuarter: string) => number | null, nsa = false) {
  return {
    ...f,
    trimestres: f.trimestres.map((t) => ({
      ...t,
      vacanciaFisicaCvmPct: nsa ? null : vac(t.refQuarter),
      flags: nsa ? ['nsa:vacanciaFisicaCvmPct'] : [],
    })),
  };
}

describe('financeiras na v2: "n de 6" (literal da spec, §4.1)', () => {
  it('ITUB4, BBAS3, BBSE3 e ITSA4 avaliam os 6 critérios em todas as janelas', () => {
    for (const t of ['ITUB4', 'BBAS3', 'BBSE3', 'ITSA4']) {
      const a = avaliarAcao(t);
      expect(a.perfil, t).toBe('acao_financeira');
      for (const j of ['3', '5', '10'] as const) {
        expect(a.janelas[j].aplicaveis, `${t} j${j}`).toBe(6);
        expect(
          a.janelas[j].resultados.filter((r) => r.estado === 'nao_se_aplica'),
          `${t} j${j}`,
        ).toHaveLength(0);
      }
    }
  });

  it('banco/seguradora de layout bancário: EBITDA e Dív.líq/EBITDA "não atende · sem dado"', () => {
    for (const t of ['ITUB4', 'BBAS3', 'BBSE3']) {
      const a = avaliarAcao(t);
      for (const id of ['ebitda', 'dl']) {
        expect(estado(a, id), `${t} ${id}`).toBe('sem_dado');
        expect(res(a, id).fato).toBe(TEXTOS_CRITERIOS.fatos.semDado);
      }
    }
  });

  it('holding de layout industrial (ITSA4): EBITDA e Dív.líq/EBITDA calculados, com valor', () => {
    const a = avaliarAcao('ITSA4');
    expect(res(a, 'ebitda').fato).toBe('cresceu em 4 de 5 anos · 8.351 → 19.380 (R$ mi)');
    expect(res(a, 'dl').fato).toBe('dentro do limite em 5 de 5 anos · máx. 0,3× (limite 3,0×)');
    expect(estado(a, 'dl')).toBe('atende');
  });

  it('FCL calculado (FCO − CAPEX) também nas financeiras (decisão 3)', () => {
    expect(res(avaliarAcao('ITUB4'), 'fcl').fato).toBe(
      'cresceu em 2 de 5 anos · 12.987 → 7.939 (R$ mi)',
    );
    expect(estado(avaliarAcao('BBSE3'), 'fcl')).toBe('nao_atende');
  });

  it("ITSA4 com receita < lucro: margem 'atende' com 'valor' (v2); sem dado com 'sem_dado'", () => {
    const a = avaliarAcao('ITSA4');
    expect(estado(a, 'mg')).toBe('atende');
    expect(res(a, 'mg').fato).toBe('positiva em 5 de 5 anos · mín. 149,3%');
    const semDado = v2Com((j) => {
      (j.criterios as { margem: { receitaMenorQueLucro: string } }).margem.receitaMenorQueLucro =
        'sem_dado';
    });
    expect(estado(avaliarAcao('ITSA4', semDado), 'mg')).toBe('sem_dado');
  });

  it("margemSemReceitaComparavel='nao_se_aplica' na v2 religa o n/a da margem (sem código)", () => {
    const religada = v2Com((j) => {
      const perfis = j.perfis as { acao_financeira: Record<string, unknown> };
      perfis.acao_financeira.margemSemReceitaComparavel = 'nao_se_aplica';
      (j.criterios as { margem: { receitaMenorQueLucro: string } }).margem.receitaMenorQueLucro =
        'sem_dado';
    });
    const a = avaliarAcao('ITUB4', religada);
    expect(estado(a, 'mg')).toBe('nao_se_aplica');
    expect(a.janelas['5'].aplicaveis).toBe(5);
  });

  it('naoSeAplica religável por params: com os ids da v2.4, volta a "n de 3"', () => {
    const religada = v2Com((j) => {
      const perfis = j.perfis as { acao_financeira: Record<string, unknown> };
      perfis.acao_financeira.naoSeAplica = ['ebitda', 'dl', 'fcl'];
    });
    expect(avaliarAcao('BBAS3', religada).janelas['5'].aplicaveis).toBe(3);
  });

  it('a v1 continua "n de 3"/"n de 2" pelo mesmo caminho (FonteCvm + resolvedor)', () => {
    expect(avaliarAcao('BBAS3', CRITERIA_PARAMS_V1).janelas['5'].aplicaveis).toBe(3);
    expect(avaliarAcao('ITUB4', CRITERIA_PARAMS_V1).janelas['5'].aplicaveis).toBe(2);
  });
});

describe('lucro descontado (§3.2/§4.1)', () => {
  it("sem net_income_adjusted na CVM: 'luc' usa o lucro líquido na janela inteira, com a obs", () => {
    const a = avaliarAcao('WEGE3');
    const luc = res(a, 'luc');
    expect(luc.estado).toBe('atende');
    expect(luc.fato).toBe('cresceu em 5 de 5 anos · 2.341 → 6.376 (R$ mi)');
    expect(luc.obs).toEqual(['lucro_sem_descontado']);
    expect(luc.fonte).toEqual(['cvm']);
    // a v1 (net_income direto) não leva a obs
    expect(res(avaliarAcao('WEGE3', CRITERIA_PARAMS_V1), 'luc').obs).toBeUndefined();
  });

  it('com o descontado aprovado em todos os anos, usa o descontado (sem obs)', () => {
    const P = v2Com((j) => {
      (j.fontes as { prioridade: { padrao: string[] } }).prioridade.padrao = ['exemplo', 'cvm'];
    });
    const a = acao('WEGE3');
    const provedor = Array.from({ length: 7 }, (_, i) => ({
      symbol: 'WEGE3',
      serie: 'net_income_adjusted' as const,
      tipoPeriodo: 'FY' as const,
      anoFiscal: 2019 + i,
      dtFim: `${2019 + i}-12-31`,
      valor: (1000 + 100 * i) * 1e6,
      fonte: 'exemplo',
      versao: 1,
      incompleto: false,
    }));
    const r = resolverSeries({
      pontos: [...pontosCvmAcao(a, ['WEGE3'], opcoesSeriesAcao(P)), ...provedor],
      series: seriesDosPerfis(P, ['acao']),
      fontes: fontesEfetivas(P),
    });
    const av = avaliarAtivo(
      {
        symbol: 'WEGE3',
        classe: 'acao',
        perfil: 'acao',
        anoFim: ANO_FIM,
        series: r.series,
        origens: r.origens,
        meses: null,
      },
      P,
      2,
    );
    expect(res(av, 'luc')).toMatchObject({
      estado: 'atende',
      fato: 'cresceu em 5 de 5 anos · 1.100 → 1.600 (R$ mi)',
      fonte: ['exemplo'],
    });
    expect(res(av, 'luc').obs).toBeUndefined();
    // a receita continua da CVM
    expect(res(av, 'rec').fonte).toEqual(['cvm']);
  });
});

describe('FII na v2 (§4.1, §5, §6)', () => {
  it('tijolo com vacância da CVM: avaliada com o ÚLTIMO trimestre do ano (decisão 4)', () => {
    // 4º trimestre = 4%, demais = 30%: com 'ultimo' o ano fica em 4% (dentro de 10%)
    const f = comVacancia(fii('HGLG11'), (q) => (q.endsWith('12-31') ? 4 : 30));
    const a = avaliarFii(f);
    expect(a.perfil).toBe('fii_tijolo');
    expect(res(a, 'vac')).toMatchObject({
      estado: 'atende',
      fato: 'dentro do limite em 5 de 5 anos · máx. 4,0% (limite 10,0%)',
      fonte: ['cvm'],
    });
    // um 4º trimestre acima de 10% = não atende
    const alta = comVacancia(fii('HGLG11'), (q) => (q === '2023-12-31' ? 12.5 : 2));
    expect(res(avaliarFii(alta), 'vac')).toMatchObject({
      estado: 'nao_atende',
      fato: 'dentro do limite em 4 de 5 anos · máx. 12,5% (limite 10,0%)',
    });
  });

  it("agregação 'media' (configurável) muda o valor do ano", () => {
    const P = v2Com((j) => {
      (j.fontes as { agregacaoAnual: Record<string, string> }).agregacaoAnual.vacancy_physical =
        'media';
    });
    const f = comVacancia(fii('HGLG11'), (q) => (q.endsWith('12-31') ? 4 : 30));
    // média = (30 + 30 + 30 + 4) / 4 = 23,5%
    expect(res(avaliarFii(f, P), 'vac').fato).toBe(
      'dentro do limite em 0 de 5 anos · máx. 23,5% (limite 10,0%)',
    );
  });

  it('papel (flag nsa) e ticker↔CNPJ não conferido = vacância sem dado', () => {
    const papel = comVacancia(fii('HGLG11'), () => 5, true);
    expect(vacanciaTrimestralFii(papel).every((t) => t.valor === null)).toBe(true);
    expect(estado(avaliarFii(papel), 'vac')).toBe('sem_dado');
    const naoConferido = comVacancia({ ...fii('HGLG11'), conferido: false }, () => 5);
    expect(vacanciaTrimestralFii(naoConferido)).toEqual([]);
  });

  it('sem vacância no informe (fixture da v2.4) = "não atende · sem dado nas demonstrações"', () => {
    const a = avaliarFii(fii('HGLG11'));
    expect(estado(a, 'vac')).toBe('sem_dado');
    expect(res(a, 'vac').fato).toBe(TEXTOS_CRITERIOS.fatos.semDado);
    expect(res(a, 'vac').motivo).toBe('sem_dado_demonstracoes');
  });

  it('papel: inadimplência e LTV ATIVOS e, sem fonte, "não atende · sem dado" (relatório do gestor)', () => {
    for (const t of ['KNCR11', 'MXRF11']) {
      const a = avaliarFii(fii(t));
      expect(a.perfil, t).toBe('fii_papel');
      for (const id of ['inad', 'ltv']) {
        expect(res(a, id)).toMatchObject({
          estado: 'sem_dado',
          fato: TEXTOS_CRITERIOS.fatos.semDadoRelatorioGestor,
          motivo: 'sem_dado_demonstracoes',
        });
      }
      expect(a.janelas['5'].aplicaveis).toBe(6);
    }
  });

  it('papel com qualidade aprovada de provedor: inadimplência e LTV avaliados', () => {
    const P = v2Com((j) => {
      (j.fontes as { prioridade: { porSerie: Record<string, string[]> } }).prioridade.porSerie = {
        vacancy_physical: ['cvm'],
        default_pct: ['exemplo'],
        ltv_avg: ['exemplo'],
      };
    });
    const f = fii('KNCR11');
    const qualidade = [2021, 2022, 2023, 2024, 2025].flatMap((ano) =>
      (['default_pct', 'ltv_avg'] as const).map((serie) => ({
        symbol: 'KNCR11',
        serie,
        tipoPeriodo: 'M' as const,
        anoFiscal: ano,
        dtFim: `${ano}-12-31`,
        valor: serie === 'default_pct' ? 1.2 : 55,
        fonte: 'exemplo',
        versao: 1,
        incompleto: false,
      })),
    );
    const r = resolverSeries({
      pontos: [...pontosCvmFii(f, { anoFim: ANO_FIM, scoring: SCORING }), ...qualidade],
      series: seriesDosPerfis(P, ['fii_tijolo', 'fii_papel']),
      fontes: fontesEfetivas(P),
    });
    const a = avaliarAtivo(
      {
        symbol: 'KNCR11',
        classe: 'fii',
        perfil: 'fii_papel',
        anoFim: ANO_FIM,
        series: r.series,
        origens: r.origens,
        meses: mesesFii(f, ANO_FIM, SCORING),
      },
      P,
      2,
    );
    expect(res(a, 'inad')).toMatchObject({ estado: 'atende', fonte: ['exemplo'] });
    expect(res(a, 'ltv')).toMatchObject({ estado: 'atende', fonte: ['exemplo'] });
  });

  it("alavancagem = leverage_pct ('Alavancagem ≤ 20% do PL'), mesmo número da v1", () => {
    const a = avaliarFii(fii('HGLG11'));
    expect(res(a, 'alav')).toMatchObject({
      estado: 'nao_atende',
      fato: 'dentro do limite em 4 de 5 anos · máx. 20,2% (limite 20,0%)',
    });
    expect(V2.perfis.fii_tijolo.find((d) => d.id === 'alav')?.rotulo).toBe(
      'Alavancagem ≤ 20% do PL',
    );
  });

  it('janela 10: "sem dado nas demonstrações" com o ano em que os informes começam (QA Pedro 16/10)', () => {
    const a = avaliarFii(fii('HGLG11'));
    expect(res(a, 'rend', '10')).toMatchObject({
      estado: 'sem_dado',
      fato: 'sem dado nas demonstrações (dados desde 2017, menos que a janela de 10 anos)',
    });
  });

  it('meses com rendimento: CVM pelos proventos ancorados; provedor por contagens anuais', () => {
    const f = fii('HGLG11');
    expect(res(avaliarFii(f), 'mes')).toMatchObject({
      estado: 'atende',
      fato: '60 de 60 meses com rendimento pago (jan/2021–dez/2025)',
      fonte: ['cvm'],
    });
    const a = avaliarAtivo(
      {
        symbol: 'HGLG11',
        classe: 'fii',
        perfil: 'fii_tijolo',
        anoFim: ANO_FIM,
        series: {},
        origens: {
          months_with_income: Object.fromEntries(
            [2021, 2022, 2023, 2024, 2025].map((a) => [
              a,
              {
                fonte: 'exemplo',
                serieUsada: 'months_with_income',
                fallback: false,
                incompleto: false,
              },
            ]),
          ),
        },
        mesesPorAno: { 2021: 12, 2022: 12, 2023: 11, 2024: 12, 2025: 12 },
        meses: mesesFii(f, ANO_FIM, SCORING),
      },
      V2,
      2,
    );
    expect(res(a, 'mes')).toMatchObject({
      estado: 'nao_atende',
      n: 59,
      de: 60,
      fato: '59 de 60 meses com rendimento pago (jan/2021–dez/2025)',
      fonte: ['exemplo'],
    });
  });
});
