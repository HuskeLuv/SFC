import { describe, expect, it, vi } from 'vitest';
import { IDS_FONTE_CONHECIDOS, SERIES_FUNDAMENTO } from '@/types/analiseAtivosFontes';
import { MAPA_SERIE_LEGADA, SERIES_CRITERIO, serieCanonica } from '@/types/analiseAtivosCriterios';
import { CRITERIA_PARAMS_CODIGO } from '../criteriaParamsCodigo';
import { CRITERIA_PARAMS_V1, CRITERIA_PARAMS_V1_JSON } from '../criteriaParamsV1';
import { CRITERIA_PARAMS_V2, CRITERIA_PARAMS_V2_JSON } from '../criteriaParamsV2';
import {
  agregacaoDaSerie,
  criteriaParamsSchema,
  criteriosDoPerfil,
  fontesCitadas,
  fontesEfetivas,
  idsNaoSeAplica,
  prioridadeDaSerie,
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

  it('CRITERIA_PARAMS_CODIGO aponta para a v2', () => {
    expect(CRITERIA_PARAMS_CODIGO).toBe(CRITERIA_PARAMS_V2);
    expect(CRITERIA_PARAMS_CODIGO.versao).toBe(2);
  });
});
