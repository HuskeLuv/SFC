import { describe, it, expect } from 'vitest';
import type { AnaliseQuadroLinha } from '@prisma/client';
import {
  paraLinhaQuadroApi,
  paraLinhaQuadroApiNaJanela,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { LINHAS_FIXTURE, linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import { definicoesChips } from '@/test/fixtures/analiseAtivos/criterios';
import {
  atendeCriterio,
  compararLinhas,
  consultarQuadro,
  definicoesQuadro,
  facetasDe,
  filtrarLinhas,
  frescorCotacao,
  idsDaQuery,
  idsFiltraveis,
} from '../consultaQuadro';
import type { LinhaQuadroApi, QuadroParams } from '@/types/analiseAtivosApi';
import type {
  CriteriosCompactos,
  EstadoCriterio,
  IdCriterio,
  PerfilCriterio,
} from '@/types/analiseAtivosCriterios';

const API = LINHAS_FIXTURE.map(paraLinhaQuadroApi);
const tickers = (ls: LinhaQuadroApi[]) => ls.map((l) => l.ticker);

type Marca = [IdCriterio, EstadoCriterio];

/** Linha com a cópia compacta nas janelas dadas (fato fixo; o filtro só olha o estado). */
function linhaComCriterios(
  symbol: string,
  perfil: PerfilCriterio,
  janelas: Partial<Record<'3' | '5' | '10', Marca[]>>,
  over: Partial<AnaliseQuadroLinha> = {},
): AnaliseQuadroLinha {
  const criterios: CriteriosCompactos = {};
  for (const [j, marcas] of Object.entries(janelas) as Array<['3' | '5' | '10', Marca[]]>) {
    criterios[j] = {
      n: marcas.filter(([, e]) => e === 'atende').length,
      de: marcas.filter(([, e]) => e !== 'nao_se_aplica').length,
      m: marcas.map(([id, e]) => [id, e, 'fato']),
    };
  }
  const classe = perfil.startsWith('fii') ? 'fii' : 'acao';
  return linhaQuadroDb({ symbol, classe, perfilCriterios: perfil, criterios, ...over });
}

function consultar(
  params: QuadroParams,
  extra: Partial<Parameters<typeof consultarQuadro>[0]> = {},
) {
  return consultarQuadro({
    params,
    linhas: API,
    versao: 'v1',
    dataRef: '2026-09-29',
    hoje: '2026-09-30',
    ...extra,
  });
}

describe('consultaQuadro · filtros', () => {
  const acoes = API.filter((l) => l.classe === 'acao' && l.noQuadro);
  const fiis = API.filter((l) => l.classe === 'fii' && l.noQuadro);

  it('só linhas do Quadro (CEDO4 fora) e contagens por classe', () => {
    const r = consultar({ classe: 'acao' });
    expect(tickers(r.itens)).not.toContain('CEDO4');
    expect(r.contagens).toEqual({ acao: acoes.length, fii: fiis.length });
    expect(r.total).toBe(acoes.length);
    expect(r.totalClasse).toBe(acoes.length);
  });

  it('setor (ações) e segmento CVM (FIIs)', () => {
    expect(tickers(filtrarLinhas(acoes, { setor: 'Financeiro' }))).toEqual(['ITUB4']);
    expect(tickers(filtrarLinhas(fiis, { segmento: 'Multicategoria' }))).toEqual(['HGLG11']);
  });

  it('naCarteira usa o conjunto do usuário', () => {
    const r = filtrarLinhas(acoes, { naCarteira: true }, new Set(['WEGE3', 'ITUB4']));
    expect(tickers(r).sort()).toEqual(['ITUB4', 'WEGE3']);
    expect(filtrarLinhas(acoes, { naCarteira: true })).toEqual([]);
  });

  it('naCarteira e setor combinam (E)', () => {
    const r = filtrarLinhas(
      acoes,
      { naCarteira: true, setor: 'Financeiro' },
      new Set(['WEGE3', 'ITUB4']),
    );
    expect(tickers(r)).toEqual(['ITUB4']);
    expect(filtrarLinhas(acoes, { setor: 'Financeiro', segmento: 'Multicategoria' })).toEqual([]);
  });
});

describe('consultaQuadro · ordem', () => {
  const linhas = [
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'BBB3', pl: 5 })),
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'AAA3', pl: null })),
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'CCC3', pl: 12 })),
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'DDD3', pl: 5, naoSeAplica: ['pl'] })),
    paraLinhaQuadroApi(linhaQuadroDb({ symbol: 'EEE3', pl: 5 })),
  ];

  it('nulos e n/a no fim nas duas direções; desempate por ticker', () => {
    expect(tickers([...linhas].sort(compararLinhas('pl', 'asc')))).toEqual([
      'BBB3',
      'EEE3',
      'CCC3',
      'AAA3',
      'DDD3',
    ]);
    expect(tickers([...linhas].sort(compararLinhas('pl', 'desc')))).toEqual([
      'CCC3',
      'BBB3',
      'EEE3',
      'AAA3',
      'DDD3',
    ]);
  });

  it('padrão A–Z (ticker asc); ticker desc inverte; o indicador antigo cai em A–Z', () => {
    expect(tickers(consultar({ classe: 'fii' }).itens)).toEqual(['HCTR11', 'HFOF11', 'HGLG11']);
    expect(tickers(consultar({ classe: 'acao' }).itens)).toEqual([
      'AURE3',
      'ITUB4',
      'TGMA3',
      'WEGE3',
    ]);
    expect(tickers([...linhas].sort(compararLinhas('ticker', 'desc')))[0]).toBe('EEE3');
    expect(tickers(consultar({ classe: 'fii', ordem: 'indiceMf' }).itens)).toEqual([
      'HCTR11',
      'HFOF11',
      'HGLG11',
    ]);
  });

  it("'criterios' = contagem atendida (desc), sem avaliação no fim; lucro10 = anos positivos", () => {
    const ls = [
      linhaComCriterios('BBB3', 'acao', {
        '5': [
          ['rec', 'atende'],
          ['luc', 'atende'],
        ],
      }),
      linhaComCriterios('AAA3', 'acao', {
        '5': [
          ['rec', 'atende'],
          ['luc', 'nao_atende'],
        ],
      }),
      linhaQuadroDb({ symbol: 'CCC3' }),
      linhaComCriterios('DDD3', 'acao', {
        '5': [
          ['rec', 'atende'],
          ['luc', 'atende'],
        ],
      }),
    ].map(paraLinhaQuadroApi);
    expect(tickers([...ls].sort(compararLinhas('criterios', 'desc')))).toEqual([
      'BBB3',
      'DDD3',
      'AAA3',
      'CCC3',
    ]);
    expect(tickers([...ls].sort(compararLinhas('criterios', 'asc'))).at(-1)).toBe('CCC3');
    const serie = (vals: number[]) => vals.map((valor, i) => ({ ano: 2016 + i, valor }));
    const l10 = [
      linhaQuadroDb({ symbol: 'XXX3', serie10a: serie([1, -1, 2]) }),
      linhaQuadroDb({ symbol: 'YYY3', serie10a: serie([1, 1, 2]) }),
      linhaQuadroDb({ symbol: 'ZZZ3', serie10a: [] }),
    ].map(paraLinhaQuadroApi);
    expect(tickers([...l10].sort(compararLinhas('lucro10', 'desc')))).toEqual([
      'YYY3',
      'XXX3',
      'ZZZ3',
    ]);
  });
});

describe('consultaQuadro · critérios (E lógico na janela)', () => {
  const P = CRITERIA_PARAMS_V1;
  const wege = linhaComCriterios('WEGE3', 'acao', {
    '5': [
      ['rec', 'atende'],
      ['luc', 'atende'],
      ['ebitda', 'atende'],
      ['mg', 'atende'],
      ['dl', 'atende'],
      ['fcl', 'nao_atende'],
    ],
    '10': [
      ['rec', 'atende'],
      ['luc', 'nao_atende'],
      ['ebitda', 'atende'],
      ['mg', 'atende'],
      ['dl', 'atende'],
      ['fcl', 'sem_dado'],
    ],
  });
  const itub = linhaComCriterios('ITUB4', 'acao_financeira', {
    '5': [
      ['rec', 'atende'],
      ['luc', 'atende'],
      ['ebitda', 'nao_se_aplica'],
      ['mg', 'atende'],
      ['dl', 'nao_se_aplica'],
      ['fcl', 'nao_se_aplica'],
    ],
  });
  const nova = linhaComCriterios('NOVA3', 'acao', {
    '5': [
      ['rec', 'sem_dado'],
      ['luc', 'atende'],
      ['ebitda', 'atende'],
      ['mg', 'atende'],
      ['dl', 'atende'],
      ['fcl', 'atende'],
    ],
  });
  const semAvaliacao = linhaQuadroDb({ symbol: 'ZERO3' });
  const hglg = linhaComCriterios(
    'HGLG11',
    'fii_tijolo',
    {
      '5': [
        ['rend', 'atende'],
        ['vp', 'atende'],
        ['vac', 'sem_dado'],
        ['alav', 'atende'],
        ['mes', 'atende'],
        ['res', 'nao_atende'],
      ],
    },
    { fiiTipo: 'tijolo' },
  );
  const kncr = linhaComCriterios(
    'KNCR11',
    'fii_papel',
    {
      '5': [
        ['rend', 'atende'],
        ['vp', 'nao_atende'],
        ['inad', 'sem_dado'],
        ['ltv', 'sem_dado'],
        ['mes', 'atende'],
        ['res', 'atende'],
      ],
    },
    { fiiTipo: 'papel' },
  );
  const rows = [wege, itub, nova, semAvaliacao, hglg, kncr];
  const consultarCrit = (classe: 'acao' | 'fii', criterios: string, janela: 3 | 5 | 10 = 5) =>
    consultarQuadro({
      params: { classe, criterios, janela },
      linhas: rows.map((r) => paraLinhaQuadroApiNaJanela(r, janela)),
      versao: 'v',
      dataRef: null,
      hoje: '2026-10-13',
      criteriaParams: P,
    });

  it('E lógico: só passa quem ATENDE a todos; sem dado e n/a nunca passam', () => {
    expect(tickers(consultarCrit('acao', 'rec').itens)).toEqual(['ITUB4', 'WEGE3']);
    expect(tickers(consultarCrit('acao', 'rec,luc,mg').itens)).toEqual(['ITUB4', 'WEGE3']);
    // EBITDA não se aplica a financeira: ITUB4 sai
    expect(tickers(consultarCrit('acao', 'rec,ebitda').itens)).toEqual(['WEGE3']);
    // FCL: WEGE3 não atende; NOVA3 atende FCL, mas está sem dado em Receita
    expect(tickers(consultarCrit('acao', 'fcl').itens)).toEqual(['NOVA3']);
    expect(consultarCrit('acao', 'rec,fcl').itens).toEqual([]);
  });

  it('a janela muda o resultado; linha sem a janela (ou sem avaliação) não passa', () => {
    expect(tickers(consultarCrit('acao', 'luc', 5).itens)).toEqual(['ITUB4', 'NOVA3', 'WEGE3']);
    expect(consultarCrit('acao', 'luc', 10).itens).toEqual([]);
    expect(consultarCrit('acao', 'rec', 3).itens).toEqual([]);
    const r = consultarCrit('acao', '', 5);
    expect(r.total).toBe(4);
    expect(r.janela).toBe(5);
  });

  it('FII: o chip de tijolo cobre o equivalente de papel (alav ↔ ltv)', () => {
    expect(tickers(consultarCrit('fii', 'rend,mes').itens)).toEqual(['HGLG11', 'KNCR11']);
    // KNCR11 tem LTV sem dado (D3): fica de fora do filtro de alavancagem
    expect(tickers(consultarCrit('fii', 'alav').itens)).toEqual(['HGLG11']);
    expect(tickers(consultarCrit('fii', 'res').itens)).toEqual(['KNCR11']);
    const api = paraLinhaQuadroApi(kncr);
    expect(atendeCriterio(api, 'alav', P.equivalencias)).toBe(false);
    expect(atendeCriterio(api, 'rend', P.equivalencias)).toBe(true);
  });

  it('chip desabilitado (vac) e id de outra classe não filtram na consulta pura (a rota dá 400)', () => {
    expect(consultarCrit('fii', 'vac').total).toBe(2);
    expect(consultarCrit('acao', 'rend').total).toBe(4);
  });

  it('resposta traz janela, totalClasse e definicoes (chips) da classe', () => {
    const r = consultarCrit('fii', 'rend');
    expect(r.totalClasse).toBe(2);
    expect(r.janela).toBe(5);
    expect(r.definicoes).toEqual(definicoesChips('fii'));
    expect(consultarCrit('acao', 'rec').definicoes).toEqual(definicoesChips('acao'));
  });

  it('definições: FII em pares, vac/inad desabilitado com selo, alav/ltv habilitado', () => {
    const fii = definicoesQuadro('fii', P);
    expect(fii.map((d) => d.id)).toEqual(['rend', 'vp', 'vac', 'alav', 'mes', 'res']);
    const vac = fii.find((d) => d.id === 'vac')!;
    expect(vac).toMatchObject({
      habilitado: false,
      seloSemDado: true,
      equivalente: { id: 'inad' },
    });
    expect(vac.motivoDesabilitado).toBeTruthy();
    expect(fii.find((d) => d.id === 'alav')).toMatchObject({
      habilitado: true,
      equivalente: { id: 'ltv' },
    });
    expect([...idsFiltraveis(fii)]).toEqual(['rend', 'vp', 'alav', 'mes', 'res']);
    expect(definicoesQuadro('acao', P).every((d) => d.habilitado && !d.equivalente)).toBe(true);
  });

  it('idsDaQuery: sem repetição, descarta desconhecidos', () => {
    expect(idsDaQuery('rec, luc,rec,xpto')).toEqual(['rec', 'luc']);
    expect(idsDaQuery(undefined)).toEqual([]);
  });

  it('nenhuma chave /indice|semaforo|destaque/ na resposta (varredura recursiva)', () => {
    const chaves: string[] = [];
    const visitar = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(visitar);
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          chaves.push(k);
          visitar(x);
        }
      }
    };
    visitar(consultarCrit('acao', 'rec'));
    visitar(consultarCrit('fii', 'rend'));
    expect(chaves.filter((k) => /indice|semaforo|destaque/i.test(k))).toEqual([]);
  });
});

describe('consultaQuadro · página, facetas e frescor', () => {
  const muitas = Array.from({ length: 60 }, (_, i) =>
    paraLinhaQuadroApi(
      linhaQuadroDb({
        symbol: `T${String(i).padStart(2, '0')}A3`,
        setor: i % 2 ? 'Financeiro' : 'Saúde',
      }),
    ),
  );

  it('página de 25 estável e sem repetição; limite máximo 100', () => {
    const p = (offset: number) =>
      consultarQuadro({
        params: { classe: 'acao', offset },
        linhas: muitas,
        versao: 'v',
        dataRef: null,
        hoje: '2026-09-30',
      });
    const vistas = [...p(0).itens, ...p(25).itens, ...p(50).itens].map((l) => l.ticker);
    expect(p(0).itens).toHaveLength(25);
    expect(p(50).itens).toHaveLength(10);
    expect(new Set(vistas).size).toBe(60);
    expect(tickers(p(0).itens)).toEqual(tickers(p(0).itens));
    const grande = consultarQuadro({
      params: { classe: 'acao', limite: 500 },
      linhas: muitas,
      versao: 'v',
      dataRef: null,
      hoje: '2026-09-30',
    });
    expect(grande.limite).toBe(100);
  });

  it('facetas: setores (ações) / segmentos CVM e tipos (FIIs), antes dos filtros', () => {
    expect(facetasDe('acao', muitas).setores).toEqual(['Financeiro', 'Saúde']);
    const r = consultar({ classe: 'fii', segmento: 'Multicategoria' });
    expect(r.facetas.tipos).toEqual(['tijolo', 'papel', 'fof']);
    expect(r.total).toBe(1);
    expect(r.totalClasse).toBe(3);
  });

  it('frescor da cotação em pregões', () => {
    expect(frescorCotacao(API, '2026-09-30')).toEqual({ data: '2026-09-29', status: 'em_dia' });
    // 02/10 de manhã: 30/09 e 01/10 saíram depois de 29/09; o de hoje ainda não fechou
    expect(frescorCotacao(API, '2026-10-02').status).toBe('em_dia');
    expect(frescorCotacao(API, '2026-10-05').status).toBe('atrasado');
    expect(frescorCotacao(API, '2026-10-08').status).toBe('atrasado');
    expect(frescorCotacao([], '2026-10-08')).toEqual({ data: null, status: 'sem_dado' });
  });
});
