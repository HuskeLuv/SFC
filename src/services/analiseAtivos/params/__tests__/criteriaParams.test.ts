import { describe, expect, it, vi } from 'vitest';
import { IDS_FONTE_CONHECIDOS, SERIES_FUNDAMENTO } from '@/types/analiseAtivosFontes';
import { MAPA_SERIE_LEGADA, SERIES_CRITERIO, serieCanonica } from '@/types/analiseAtivosCriterios';
import { CRITERIA_PARAMS_CODIGO } from '../criteriaParamsCodigo';
import { CRITERIA_PARAMS_V1, CRITERIA_PARAMS_V1_JSON } from '../criteriaParamsV1';
import { CRITERIA_PARAMS_V2, CRITERIA_PARAMS_V2_JSON } from '../criteriaParamsV2';
import { CRITERIA_PARAMS_V3, CRITERIA_PARAMS_V3_JSON } from '../criteriaParamsV3';
import { UNIVERSO_EUA_PADRAO } from '@/types/analiseAtivosEua';
import {
  agregacaoDaSerie,
  criteriaParamsSchema,
  criteriosDoPerfil,
  fontesCitadas,
  fontesEfetivas,
  idsNaoSeAplica,
  perfilDisponivel,
  prioridadeDaSerie,
  universoEuaDe,
  SANIDADE_PADRAO,
  sanidadeAplicaA,
  seriesObrigatorias,
} from '../criteriaParamsSchema';
import { ErroParams, obterCriteriaParams, validarCriteriaParams } from '../obterCriteriaParams';

const copia = () => structuredClone(CRITERIA_PARAMS_V1);

describe('CriteriaParams v1', () => {
  it('é válido pelo schema estrito', () => {
    expect(criteriaParamsSchema.safeParse(CRITERIA_PARAMS_V1).success).toBe(true);
    expect(validarCriteriaParams(CRITERIA_PARAMS_V1).versao).toBe(1);
  });

  it('janelas 3/5/10 com padrão 5 e âncora em maio', () => {
    expect(CRITERIA_PARAMS_V1.janelas).toEqual([3, 5, 10]);
    expect(CRITERIA_PARAMS_V1.janelaPadrao).toBe(5);
    expect(CRITERIA_PARAMS_V1.ancoraAno.mesLiberaAnoAnterior).toBe(5);
  });

  it('6 critérios por perfil, na ordem do protótipo', () => {
    expect(CRITERIA_PARAMS_V1.perfis.acao.map((c) => c.id)).toEqual([
      'rec',
      'luc',
      'ebitda',
      'mg',
      'dl',
      'fcl',
    ]);
    expect(CRITERIA_PARAMS_V1.perfis.fii_tijolo.map((c) => c.id)).toEqual([
      'rend',
      'vp',
      'vac',
      'alav',
      'mes',
      'res',
    ]);
    expect(CRITERIA_PARAMS_V1.perfis.fii_papel.map((c) => c.id)).toEqual([
      'rend',
      'vp',
      'inad',
      'ltv',
      'mes',
      'res',
    ]);
  });

  it('limites do screen.js e rótulos decididos', () => {
    const porId = Object.fromEntries(
      [
        ...CRITERIA_PARAMS_V1.perfis.acao,
        ...CRITERIA_PARAMS_V1.perfis.fii_tijolo,
        ...CRITERIA_PARAMS_V1.perfis.fii_papel,
      ].map((c) => [c.id, c]),
    );
    expect(porId.dl.limite).toBe(3);
    expect(porId.dl.rotulo).toBe('Dív. líq./EBITDA ≤ 3×');
    expect(porId.vac.limite).toBe(10);
    expect(porId.alav.limite).toBe(20);
    expect(porId.alav.rotulo).toBe('Obrigações/PL ≤ 20%');
    expect(porId.inad.limite).toBe(3);
    expect(porId.ltv.limite).toBe(60);
    // FCL = fco − capex, nunca o campo fcf
    expect(porId.fcl.serie).toBe('free_cash_flow');
    expect(porId.fcl.definicao).toContain('FCO − CAPEX');
  });

  it('D3: vacância, inadimplência e LTV inativos com motivo; o resto ativo', () => {
    const todos = [
      ...CRITERIA_PARAMS_V1.perfis.acao,
      ...CRITERIA_PARAMS_V1.perfis.fii_tijolo,
      ...CRITERIA_PARAMS_V1.perfis.fii_papel,
    ];
    const inativos = [...new Set(todos.filter((c) => c.ativo === false).map((c) => c.id))];
    expect(inativos.sort()).toEqual(['inad', 'ltv', 'vac']);
    for (const c of todos.filter((x) => x.ativo === false)) {
      expect(c.motivoInativo).toBe('sem_fonte_confiavel');
    }
  });

  it('D4: financeira com naoSeAplica de 3 (n de 3) sobre a lista de ações', () => {
    expect(CRITERIA_PARAMS_V1.perfis.acao_financeira.naoSeAplica).toEqual(['ebitda', 'dl', 'fcl']);
    expect(criteriosDoPerfil(CRITERIA_PARAMS_V1, 'acao_financeira')).toHaveLength(6);
    const aplicaveis =
      criteriosDoPerfil(CRITERIA_PARAMS_V1, 'acao_financeira').length -
      idsNaoSeAplica(CRITERIA_PARAMS_V1, 'acao_financeira').length;
    expect(aplicaveis).toBe(3);
    expect(idsNaoSeAplica(CRITERIA_PARAMS_V1, 'acao')).toEqual([]);
  });

  it('regras: equivalências, híbrido 50%, Dív.líq/EBITDA e meses', () => {
    expect(CRITERIA_PARAMS_V1.equivalencias).toEqual({ vac: 'inad', alav: 'ltv' });
    expect(CRITERIA_PARAMS_V1.regraHibrido.limiarImoveisPlPct).toBe(50);
    expect(CRITERIA_PARAMS_V1.regraHibrido.aplicaA).toContain('fof');
    expect(CRITERIA_PARAMS_V1.dlEbitda).toEqual({
      caixaLiquido: 'atende',
      exibirNegativoComoZero: true,
      ebitdaNaoPositivo: 'nao_atende_se_dl_positiva',
    });
    expect(CRITERIA_PARAMS_V1.meses).toEqual({ ancora: 'fim_anoFim', mesesBaseCurta: 'sem_dado' });
  });
});

describe('criteriaParamsSchema recusa', () => {
  const invalido = (p: unknown) => criteriaParamsSchema.safeParse(p).success === false;

  it('chave extra na raiz, no perfil e no critério', () => {
    expect(invalido({ ...copia(), extra: 1 })).toBe(true);
    const p = copia();
    (p.perfis.acao[0] as Record<string, unknown>).peso = 0.2;
    expect(invalido(p)).toBe(true);
    const q = copia();
    (q.perfis as Record<string, unknown>).stocks = [];
    expect(invalido(q)).toBe(true);
  });

  it('limite ausente em max/min e limite em up', () => {
    const p = copia();
    delete (p.perfis.acao[4] as { limite?: number }).limite;
    expect(invalido(p)).toBe(true);
    const q = copia();
    (q.perfis.acao[0] as { limite?: number }).limite = 1;
    expect(invalido(q)).toBe(true);
  });

  it('ids duplicados e lista com tamanho ≠ 6', () => {
    const p = copia();
    p.perfis.acao[1] = { ...p.perfis.acao[1], id: 'rec' };
    expect(invalido(p)).toBe(true);
    const q = copia();
    q.perfis.fii_tijolo = q.perfis.fii_tijolo.slice(0, 5);
    expect(invalido(q)).toBe(true);
  });

  it('inativo sem motivo, naoSeAplica fora da lista, equivalência trocada, janela padrão fora', () => {
    const p = copia();
    delete (p.perfis.fii_tijolo[2] as { motivoInativo?: string }).motivoInativo;
    expect(invalido(p)).toBe(true);
    const q = copia();
    q.perfis.acao_financeira.naoSeAplica = ['ebitda', 'vac'];
    expect(invalido(q)).toBe(true);
    const r = copia();
    r.equivalencias = { inad: 'vac' };
    expect(invalido(r)).toBe(true);
    const s = copia();
    s.janelas = [3, 10];
    expect(invalido(s)).toBe(true);
  });
});

describe('obterCriteriaParams', () => {
  const linha = (version: number, params: unknown) => ({
    id: 'x',
    version,
    params,
    validFrom: new Date('2026-10-15T00:00:00.000Z'),
    createdBy: 'seed-v2-filtros',
    notas: null,
    createdAt: new Date(),
  });

  it('lê a versão ativa (maior com validFrom ≤ agora) e revalida', async () => {
    const findFirst = vi.fn().mockResolvedValue(linha(1, CRITERIA_PARAMS_V1));
    const prisma = { criteriaParams: { findFirst, findUnique: vi.fn() } };
    const r = await obterCriteriaParams(prisma as never);
    expect(r.versao).toBe(1);
    expect(r.params.perfis.acao).toHaveLength(6);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { version: 'desc' } }),
    );
  });

  it('sem versão ativa, versão inexistente e JSON inválido = ErroParams', async () => {
    const vazio = {
      criteriaParams: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    await expect(obterCriteriaParams(vazio as never)).rejects.toMatchObject({
      codigo: 'sem_versao_ativa',
    });
    await expect(obterCriteriaParams(vazio as never, { versao: 9 })).rejects.toMatchObject({
      codigo: 'versao_inexistente',
    });
    const ruim = {
      criteriaParams: { findFirst: vi.fn().mockResolvedValue(linha(2, { versao: 2 })) },
    };
    await expect(obterCriteriaParams(ruim as never)).rejects.toBeInstanceOf(ErroParams);
  });
});

describe('v2.5 — alias legado → spec no parse', () => {
  it('a v1 GRAVADA (nomes legados) continua válida e sai com os nomes canônicos', () => {
    const v1 = validarCriteriaParams(structuredClone(CRITERIA_PARAMS_V1_JSON), 'v1 gravada');
    const series = Object.fromEntries(
      [...v1.perfis.acao, ...v1.perfis.fii_tijolo, ...v1.perfis.fii_papel].map((c) => [
        c.id,
        c.serie,
      ]),
    );
    expect(series).toEqual({
      rec: 'revenue',
      luc: 'net_income',
      ebitda: 'ebitda',
      mg: 'net_margin',
      dl: 'net_debt_ebitda',
      fcl: 'free_cash_flow',
      rend: 'income_per_share',
      vp: 'nav_per_share',
      vac: 'vacancy_physical',
      alav: 'leverage_pct',
      mes: 'months_with_income',
      res: 'ffo',
      inad: 'default_pct',
      ltv: 'ltv_avg',
    });
    // re-parse do já canônico é idempotente (seed compara versões pelo parse)
    expect(validarCriteriaParams(structuredClone(v1))).toEqual(v1);
    expect(v1).toEqual(CRITERIA_PARAMS_V1);
  });

  it('o mapa legado cobre TODOS os nomes usados pela v1 e só aponta para o catálogo', () => {
    const usados = [
      ...CRITERIA_PARAMS_V1_JSON.perfis.acao,
      ...CRITERIA_PARAMS_V1_JSON.perfis.fii_tijolo,
      ...CRITERIA_PARAMS_V1_JSON.perfis.fii_papel,
    ].map((c) => c.serie as string);
    for (const nome of usados) expect(serieCanonica(nome), nome).not.toBeNull();
    for (const canonico of Object.values(MAPA_SERIE_LEGADA)) {
      expect(SERIES_CRITERIO).toContain(canonico);
      expect(SERIES_FUNDAMENTO).toContain(canonico);
    }
    expect(serieCanonica('rating')).toBeNull();
  });

  it('padrões da v2.4 quando os campos novos estão ausentes (a v1 avalia igual)', () => {
    expect(CRITERIA_PARAMS_V1.perfis.acao_financeira.margemSemReceitaComparavel).toBe(
      'nao_se_aplica',
    );
    expect(CRITERIA_PARAMS_V1.perfis.acao_financeira.notaEssencial).toBe(true);
    expect(CRITERIA_PARAMS_V1.criterios.margem.receitaMenorQueLucro).toBe('sem_dado');
    expect(CRITERIA_PARAMS_V1.fontes).toBeUndefined();
    expect(fontesEfetivas(CRITERIA_PARAMS_V1)).toEqual({
      prioridade: { padrao: ['cvm'], porSerie: {} },
      agregacaoAnual: {},
      sanidade: SANIDADE_PADRAO,
      obrigatorias: {},
    });
  });

  it('série desconhecida e serieFallback igual à serie são recusadas', () => {
    const p = copia() as unknown as { perfis: { acao: Array<Record<string, unknown>> } };
    p.perfis.acao[0].serie = 'rating';
    expect(criteriaParamsSchema.safeParse(p).success).toBe(false);
    const q = structuredClone(CRITERIA_PARAMS_V2_JSON) as unknown as {
      perfis: { acao: Array<Record<string, unknown>> };
    };
    q.perfis.acao[1].serieFallback = 'net_income_adjusted';
    expect(criteriaParamsSchema.safeParse(q).success).toBe(false);
  });
});

describe('CriteriaParams v2 (spec do Pedro + camada de fontes)', () => {
  const V2 = CRITERIA_PARAMS_V2;
  const todos = [...V2.perfis.acao, ...V2.perfis.fii_tijolo, ...V2.perfis.fii_papel];
  const porId = Object.fromEntries(todos.map((c) => [c.id, c]));

  it('é válida, versão 2, 6 critérios por perfil com os mesmos ids da v1', () => {
    expect(validarCriteriaParams(structuredClone(CRITERIA_PARAMS_V2_JSON)).versao).toBe(2);
    for (const perfil of ['acao', 'fii_tijolo', 'fii_papel'] as const) {
      expect(V2.perfis[perfil].map((c) => c.id)).toEqual(
        CRITERIA_PARAMS_V1.perfis[perfil].map((c) => c.id),
      );
    }
  });

  it('séries com os nomes da spec §4.1', () => {
    expect(Object.fromEntries(todos.map((c) => [c.id, c.serie]))).toEqual({
      rec: 'revenue',
      luc: 'net_income_adjusted',
      ebitda: 'ebitda',
      mg: 'net_margin',
      dl: 'net_debt_ebitda',
      fcl: 'free_cash_flow',
      rend: 'income_per_share',
      vp: 'nav_per_share',
      vac: 'vacancy_physical',
      alav: 'leverage_pct',
      mes: 'months_with_income',
      res: 'ffo',
      inad: 'default_pct',
      ltv: 'ltv_avg',
    });
    expect(porId.luc.serieFallback).toBe('net_income');
    for (const c of todos) {
      if (c.serieFallback) expect(SERIES_CRITERIO).toContain(c.serieFallback);
    }
  });

  it('financeiras "n de 6": naoSeAplica vazio, margem sem_dado, sem nota no Essencial', () => {
    expect(V2.perfis.acao_financeira.naoSeAplica).toEqual([]);
    expect(idsNaoSeAplica(V2, 'acao_financeira')).toEqual([]);
    expect(V2.perfis.acao_financeira.margemSemReceitaComparavel).toBe('sem_dado');
    expect(V2.perfis.acao_financeira.notaEssencial).toBe(false);
    expect(V2.criterios.margem.receitaMenorQueLucro).toBe('valor');
  });

  it('vacância, inadimplência e LTV ativos; rótulos da spec', () => {
    expect(todos.filter((c) => c.ativo === false)).toEqual([]);
    expect(porId.alav.rotulo).toBe('Alavancagem ≤ 20% do PL');
    expect(porId.dl.rotulo).toBe('Dív. líq./EBITDA < 3×');
    // a verificação continua ≤ 3,0 (caixa líquido conta)
    expect(porId.dl.tipo).toBe('max');
    expect(porId.dl.limite).toBe(3);
    expect([porId.vac.limite, porId.alav.limite, porId.inad.limite, porId.ltv.limite]).toEqual([
      10, 20, 3, 60,
    ]);
    expect(porId.luc.definicao).toContain('descontado');
  });

  it('limites, janelas e regras do screen.js iguais aos da v1', () => {
    expect(V2.janelas).toEqual(CRITERIA_PARAMS_V1.janelas);
    expect(V2.janelaPadrao).toBe(CRITERIA_PARAMS_V1.janelaPadrao);
    expect(V2.ancoraAno).toEqual(CRITERIA_PARAMS_V1.ancoraAno);
    expect(V2.equivalencias).toEqual(CRITERIA_PARAMS_V1.equivalencias);
    expect(V2.regraHibrido).toEqual(CRITERIA_PARAMS_V1.regraHibrido);
    expect(V2.dlEbitda).toEqual(CRITERIA_PARAMS_V1.dlEbitda);
    expect(V2.meses).toEqual(CRITERIA_PARAMS_V1.meses);
  });

  it('fontes: só ids conhecidos, vacância da CVM ligada, agregação "último"', () => {
    const f = fontesEfetivas(V2);
    for (const id of fontesCitadas(f)) expect(IDS_FONTE_CONHECIDOS).toContain(id);
    expect(prioridadeDaSerie(f, 'vacancy_physical')).toEqual(['cvm']);
    expect(prioridadeDaSerie(f, 'revenue')).toEqual(['cvm']);
    expect(agregacaoDaSerie(f, 'vacancy_physical')).toBe('ultimo');
    expect(agregacaoDaSerie(f, 'default_pct')).toBe('ultimo');
    expect(agregacaoDaSerie(f, 'gla_m2')).toBe('ultimo');
    expect(f.sanidade).toEqual({
      variacaoRevisaoPct: 40,
      divergenciaMaxPct: 5,
      confiancaMin: 0.8,
      aplicaA: ['provedor'],
    });
    expect(sanidadeAplicaA(f, 'provedor')).toBe(true);
    expect(sanidadeAplicaA(f, 'cvm')).toBe(false);
    expect(seriesObrigatorias(f, 'br_acoes')).toEqual(['revenue', 'net_income']);
    expect(seriesObrigatorias(f, 'us_reits')).toEqual([]);
  });

  it('perfis EUA ausentes na v2: lista vazia, sem naoSeAplica e indisponíveis', () => {
    expect(V2.perfis.stock).toBeUndefined();
    expect(criteriosDoPerfil(V2, 'stock')).toEqual([]);
    expect(criteriosDoPerfil(V2, 'reit')).toEqual([]);
    expect(idsNaoSeAplica(V2, 'stock_financeira')).toEqual([]);
    expect(perfilDisponivel(V2, 'stock')).toBe(false);
    expect(perfilDisponivel(V2, 'acao')).toBe(true);
    expect(universoEuaDe(V2)).toBe(UNIVERSO_EUA_PADRAO);
  });
});

describe('CriteriaParams v3 (Stocks e REITs pela SEC)', () => {
  const V3 = CRITERIA_PARAMS_V3;
  const copia3 = () =>
    structuredClone(CRITERIA_PARAMS_V3_JSON) as Record<string, unknown> & {
      perfis: Record<string, unknown>;
    };

  it('v1, v2 e v3 validam (v1/v2 como gravadas em produção)', () => {
    expect(validarCriteriaParams(CRITERIA_PARAMS_V1_JSON).versao).toBe(1);
    expect(validarCriteriaParams(CRITERIA_PARAMS_V2_JSON).versao).toBe(2);
    expect(validarCriteriaParams(CRITERIA_PARAMS_V3_JSON).versao).toBe(3);
    // round-trip JSON (o que o banco devolve)
    expect(validarCriteriaParams(JSON.parse(JSON.stringify(CRITERIA_PARAMS_V3_JSON)))).toEqual(V3);
  });

  it('Brasil IDÊNTICO à v2 (perfis, fontes BR e regras): o job BR avalia igual', () => {
    const { versao: _v2, descricao: _d2, perfis: p2, fontes: f2, ...resto2 } = V2Parse();
    const { versao: _v3, descricao: _d3, perfis: p3, fontes: f3, universoEua: _u, ...resto3 } = V3;
    expect(resto3).toEqual(resto2);
    for (const perfil of ['acao', 'acao_financeira', 'fii_tijolo', 'fii_papel'] as const) {
      expect(p3[perfil]).toEqual(p2[perfil]);
    }
    expect(f3?.prioridade.padrao).toEqual(f2?.prioridade.padrao);
    expect(f3?.prioridade.porSerie).toEqual(f2?.prioridade.porSerie);
    expect(fontesCitadas(fontesEfetivas(V3))).toEqual(fontesCitadas(fontesEfetivas(V2Parse())));
  });

  it('stock: os 6 ids das ações, em US$; financeira n de 6 por SIC', () => {
    expect(V3.perfis.stock!.map((c) => c.id)).toEqual(['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']);
    expect(V3.perfis.stock!.find((c) => c.id === 'dl')).toMatchObject({ limite: 3, tipo: 'max' });
    expect(V3.perfis.stock!.filter((c) => c.unidade).every((c) => c.unidade === 'US$ mi')).toBe(
      true,
    );
    expect(V3.perfis.stock_financeira).toEqual({
      base: 'stock',
      naoSeAplica: [],
      regraPerfil: 'sic_financeira',
    });
    expect(criteriosDoPerfil(V3, 'stock_financeira')).toBe(V3.perfis.stock);
    expect(idsNaoSeAplica(V3, 'stock_financeira')).toEqual([]);
    expect(perfilDisponivel(V3, 'stock_financeira')).toBe(true);
  });

  it('reit: rec, dpa, fco_acao, dl ≤ 6×, pay ≤ 90 e ocup ≥ 95 inativa (n de 6)', () => {
    const r = V3.perfis.reit!;
    expect(r.map((c) => c.id)).toEqual(['rec', 'dpa', 'fco_acao', 'dl', 'pay', 'ocup']);
    const porId = Object.fromEntries(r.map((c) => [c.id, c]));
    expect(porId.dl).toMatchObject({ tipo: 'max', limite: 6, serie: 'net_debt_ebitda' });
    expect(porId.pay).toMatchObject({ tipo: 'max', limite: 90, serie: 'cash_payout_pct' });
    expect(porId.ocup).toMatchObject({
      tipo: 'min',
      limite: 95,
      ativo: false,
      motivoInativo: 'sem_fonte_confiavel',
    });
    expect(porId.dpa).toMatchObject({ serie: 'dividend_per_share', unidade: 'US$', formato: 'n2' });
    expect(porId.fco_acao).toMatchObject({ serie: 'ocf_per_share', unidade: 'US$' });
    // ffo_acao fica reservado (fase 2): nenhum perfil da v3 usa
    expect([...V3.perfis.stock!, ...r].some((c) => c.id === 'ffo_acao')).toBe(false);
  });

  it('fontes por mercado: us_stocks/us_reits → sec; BR segue padrão/porSerie', () => {
    const f = fontesEfetivas(V3);
    expect(prioridadeDaSerie(f, 'revenue', 'us_stocks')).toEqual(['sec']);
    expect(prioridadeDaSerie(f, 'dividend_per_share', 'us_reits')).toEqual(['sec']);
    expect(prioridadeDaSerie(f, 'revenue', 'br_acoes')).toEqual(['cvm']);
    expect(prioridadeDaSerie(f, 'revenue')).toEqual(['cvm']);
    expect(prioridadeDaSerie(f, 'vacancy_physical', 'br_fii')).toEqual(['cvm']);
    expect(fontesCitadas(f)).toEqual(['cvm']);
  });

  it('universo EUA = decisão de 17/10: stocks ≥ US$ 2 bi (sai < 1,6 bi), REITs ≥ US$ 2 bi', () => {
    expect(V3.universoEua).toEqual(UNIVERSO_EUA_PADRAO);
    expect(universoEuaDe(V3)).toEqual({
      stock: { floatEntradaUsd: 2e9, floatSaidaUsd: 1.6e9 },
      reit: { floatEntradaUsd: 2e9, floatSaidaUsd: 1.6e9 },
      sanidadeFloat: { maxUsd: 1e12, precoImplicitoMinUsd: 0.5, precoImplicitoMaxUsd: 100_000 },
    });
  });

  it('recusa 7 critérios num perfil EUA', () => {
    const p = copia3();
    const reit = p.perfis.reit as unknown[];
    p.perfis.reit = [...reit, { ...(reit[0] as object), id: 'ffo_acao' }];
    expect(criteriaParamsSchema.safeParse(p).success).toBe(false);
    const q = copia3();
    q.perfis.stock = [...(q.perfis.stock as unknown[]), (q.perfis.stock as unknown[])[0]];
    expect(criteriaParamsSchema.safeParse(q).success).toBe(false);
  });

  it('stock_financeira: naoSeAplica ⊂ ids de stock, sem repetição, e exige perfis.stock', () => {
    const fora = copia3();
    fora.perfis.stock_financeira = {
      base: 'stock',
      naoSeAplica: ['rend'],
      regraPerfil: 'sic_financeira',
    };
    expect(criteriaParamsSchema.safeParse(fora).error?.issues[0].message).toMatch(
      /fora de perfis\.stock/,
    );
    const rep = copia3();
    rep.perfis.stock_financeira = {
      base: 'stock',
      naoSeAplica: ['dl', 'dl'],
      regraPerfil: 'sic_financeira',
    };
    expect(criteriaParamsSchema.safeParse(rep).success).toBe(false);
    const ok = copia3();
    ok.perfis.stock_financeira = {
      base: 'stock',
      naoSeAplica: ['ebitda', 'dl', 'fcl'],
      regraPerfil: 'sic_financeira',
    };
    const lido = criteriaParamsSchema.parse(ok);
    expect(idsNaoSeAplica(lido, 'stock_financeira')).toEqual(['ebitda', 'dl', 'fcl']);
    const semStock = copia3();
    delete semStock.perfis.stock;
    expect(criteriaParamsSchema.safeParse(semStock).error?.issues[0].message).toMatch(
      /stock_financeira exige perfis\.stock/,
    );
  });

  it('universo: saída acima da entrada e preço implícito invertido são recusados', () => {
    const a = copia3();
    a.universoEua = { ...UNIVERSO_EUA_PADRAO, stock: { floatEntradaUsd: 2e9, floatSaidaUsd: 3e9 } };
    expect(criteriaParamsSchema.safeParse(a).success).toBe(false);
    const b = copia3();
    b.universoEua = {
      ...UNIVERSO_EUA_PADRAO,
      sanidadeFloat: { maxUsd: 1e12, precoImplicitoMinUsd: 10, precoImplicitoMaxUsd: 1 },
    };
    expect(criteriaParamsSchema.safeParse(b).success).toBe(false);
  });

  it('CRITERIA_PARAMS_CODIGO aponta para a v3 (BR igual à v2)', () => {
    expect(CRITERIA_PARAMS_CODIGO).toBe(CRITERIA_PARAMS_V3);
    expect(CRITERIA_PARAMS_CODIGO.versao).toBe(3);
  });
});

function V2Parse() {
  return CRITERIA_PARAMS_V2;
}
