/**
 * Orquestração do job scores com repositórios mockados e as tabelas da fatia D em memória:
 * dataRef = último pregão (domingo ⇒ sexta), idempotência (2 runs regravam a mesma chave), índice por
 * empresa replicado aos tickers, FII não conferido sem score, FoF fora do Índice, reescrita de
 * proventos sem órfão quando o Yahoo reinsere a linha com id novo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type {
  AlertaJob,
  ContagemAcoes,
  EmissorInfo,
  FiiMes,
  FundamentosPeriodo,
  JobContexto,
  ProventoBruto,
  ResumoCotacao,
  TickerAcao,
  TickerFii,
} from '@/services/analiseAtivos/tipos';

const dados = vi.hoisted(() => ({
  acoes: [] as TickerAcao[],
  fiis: [] as TickerFii[],
  emissores: [] as EmissorInfo[],
  contagens: [] as ContagemAcoes[],
  mensal: [] as FiiMes[],
  fund: [] as FundamentosPeriodo[],
  resumos: [] as ResumoCotacao[],
  proventos: [] as ProventoBruto[],
  // bloco C: série recente de cotações, pré-filtro de salto e liberações da curadoria
  series: new Map<string, Array<{ date: string; closeRaw: number; negocios: number }>>(),
  liberacoes: new Set<string>(),
  liberadosDesde: [] as string[],
}));

vi.mock('@/services/analiseAtivos/repositorio/universo', () => ({
  listarTickersAcoes: vi.fn(async () => dados.acoes),
  listarFiisListados: vi.fn(async () => dados.fiis),
  listarEmissores: vi.fn(async () => dados.emissores),
}));
vi.mock('@/services/analiseAtivos/repositorio/acoes', () => ({
  contagensAcoes: vi.fn(async () => dados.contagens),
  fundamentosVigentes: vi.fn(
    async (_p: unknown, cnpjs: string[], o: { tipos: string[]; desde?: string }) =>
      dados.fund.filter(
        (f) =>
          cnpjs.includes(f.emissorId) &&
          o.tipos.includes(f.tipoPeriodo) &&
          (!o.desde || f.dtFim >= o.desde),
      ),
  ),
  emissoresAlteradosDesde: vi.fn(async () => []),
}));
vi.mock('@/services/analiseAtivos/repositorio/fii', () => ({
  fiiMensalSerie: vi.fn(async () => dados.mensal),
  fiisAlteradosDesde: vi.fn(async () => []),
  fiiTrimestralUltimos: vi.fn(async () => []),
}));
vi.mock('@/services/analiseAtivos/repositorio/cotacoes', () => ({
  resumoCotacoes: vi.fn(async () => dados.resumos),
  serieRecenteCotacoes: vi.fn(
    async (_p: unknown, symbols: string[]) =>
      new Map(symbols.filter((s) => dados.series.has(s)).map((s) => [s, dados.series.get(s)!])),
  ),
  simbolosComSaltoDePreco: vi.fn(async () => new Set(dados.series.keys())),
  cotacaoFimDePeriodo: vi.fn(
    async (_p: unknown, pares: Array<{ symbol: string; dtFim: string }>) => {
      const m = new Map();
      for (const par of pares) {
        m.set(`${par.symbol}|${par.dtFim}`, {
          symbol: par.symbol,
          date: par.dtFim.replace(/-31$/, '-30'),
          closeRaw: 40,
          volumeFin: 0,
          negocios: 1,
          codBdi: '02',
        });
      }
      return m;
    },
  ),
}));
vi.mock('@/services/analiseAtivos/repositorio/proventos', () => ({
  proventosBrutos: vi.fn(async (_p: unknown, symbols: string[]) =>
    dados.proventos.filter((x) => symbols.includes(x.symbol)),
  ),
  coberturaProventos: vi.fn(
    async (_p: unknown, symbols: string[]) => new Map(symbols.map((s) => [s, 'OK'])),
  ),
  eventosCorporativosBrutos: vi.fn(async () => []),
}));
vi.mock('@/services/analiseAtivos/repositorio/jobs', () => ({
  ultimaExecucaoOkPorJob: vi.fn(async () => new Map()),
}));
vi.mock('@/services/analiseAtivos/repositorio/curadoria', () => ({
  conjuntoLiberacoes: vi.fn(async () => dados.liberacoes),
  simbolosLiberadosDesde: vi.fn(async () => dados.liberadosDesde),
}));

import { executarScores } from '@/services/analiseAtivos/calculo/executarScores';
import { dataRefScores } from '@/services/analiseAtivos/calculo/recalcularScores';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import {
  conjuntoLiberacoes,
  simbolosLiberadosDesde,
} from '@/services/analiseAtivos/repositorio/curadoria';
import { ultimaExecucaoOkPorJob } from '@/services/analiseAtivos/repositorio/jobs';
import {
  serieRecenteCotacoes,
  simbolosComSaltoDePreco,
} from '@/services/analiseAtivos/repositorio/cotacoes';

type Linha = Record<string, unknown>;

/** Tabelas da fatia D em memória, com a semântica usada por gravarDerivados. */
function fakePrisma() {
  const tabelas: Record<string, Linha[]> = {
    assetProventoAuditado: [],
    assetCorporateActionCheck: [],
    assetPerShareYearly: [],
    assetMultiplesYearly: [],
    assetMultiplesCurrent: [],
    assetScore: [],
  };
  const casa = (l: Linha, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => {
      const val = l[k];
      if (v && typeof v === 'object' && 'in' in (v as object)) {
        const lista = (v as { in: unknown[] }).in.map((x) => (x instanceof Date ? x.getTime() : x));
        return lista.includes(val instanceof Date ? val.getTime() : val);
      }
      if (v && typeof v === 'object' && 'lt' in (v as object)) {
        return (val as Date).getTime() < ((v as { lt: Date }).lt as Date).getTime();
      }
      if (v instanceof Date) return (val as Date).getTime() === v.getTime();
      return val === v;
    });
  const delegate = (nome: string) => ({
    findMany: vi.fn(async (a: { where?: Record<string, unknown> } = {}) =>
      tabelas[nome].filter((l) => casa(l, a.where)).map((l) => ({ ...l })),
    ),
    deleteMany: vi.fn(async (a: { where?: Record<string, unknown> } = {}) => {
      const antes = tabelas[nome].length;
      tabelas[nome] = tabelas[nome].filter((l) => !casa(l, a.where));
      return { count: antes - tabelas[nome].length };
    }),
    createMany: vi.fn(async (a: { data: Linha[] }) => {
      tabelas[nome].push(...a.data.map((d) => ({ ...d })));
      return { count: a.data.length };
    }),
    groupBy: vi.fn(async (a: { by: string[]; where?: Record<string, unknown> }) => {
      const k = a.by[0];
      const vistos = new Map<number, Linha>();
      for (const l of tabelas[nome].filter((x) => casa(x, a.where))) {
        vistos.set((l[k] as Date).getTime(), { [k]: l[k] });
      }
      return [...vistos.values()];
    }),
  });
  const prisma = {
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    ...Object.fromEntries(Object.keys(tabelas).map((n) => [n, delegate(n)])),
  };
  return { prisma: prisma as unknown as PrismaClient, tabelas };
}

function ctxDe(prisma: PrismaClient, hoje: string, alertas: AlertaJob[] = []): JobContexto {
  return {
    prisma,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: () => undefined,
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje,
    origem: 'script',
    aplicar: true,
  };
}

function fy(
  emissorId: string,
  ano: number,
  lucro: number,
  extra: Partial<FundamentosPeriodo> = {},
): FundamentosPeriodo {
  return {
    emissorId,
    docTipo: 'DFP',
    tipoPeriodo: 'FY',
    escopo: 'con',
    padraoContabil: 'IFRS',
    dtIni: `${ano}-01-01`,
    dtFim: `${ano}-12-31`,
    anoFiscal: ano,
    trimestreFiscal: null,
    versao: 1,
    dtEntregaOriginal: `${ano + 1}-02-20`,
    receita: lucro * 6,
    lucroBruto: null,
    ebit: lucro * 1.3,
    depreciacaoAmortizacao: lucro * 0.1,
    lucroLiquido: lucro,
    lucroAtribuivel: lucro,
    ativoTotal: lucro * 8,
    ativoCirculante: lucro * 3,
    passivoCirculante: lucro * 2,
    caixa: lucro,
    aplicacoesFinanceiras: 0,
    dividaBrutaCp: lucro * 0.2,
    dividaBrutaLp: lucro * 0.3,
    pl: lucro * 4,
    plControladora: lucro * 4,
    fco: lucro * 1.2,
    fci: null,
    fcf: null,
    capex: lucro * 0.4,
    dividendosJcpPagos: null,
    dmplDeclarado: lucro * 0.5,
    lpaOn: null,
    lpaPn: null,
    naoSeAplica: [],
    flags: [],
    ...extra,
  };
}

function mes(cnpj: string, refMonth: string, extra: Partial<FiiMes>): FiiMes {
  return {
    cnpj,
    refMonth,
    vpCota: 163.1,
    pl: 1e9,
    cotas: 6e6,
    cotistas: 1000,
    passivoTotal: null,
    rendDistribuir: null,
    imoveis: null,
    spe: null,
    cri: null,
    lciLca: null,
    cotasFii: null,
    tipoComposicao: 'tijolo',
    tipoVigente: 'tijolo',
    reguaVigente: 'fii_tijolo',
    obrigacoesPlPct: 9,
    segmentoCvm: null,
    fatorDesdobramento: null,
    flags: [],
    ...extra,
  };
}

function resumo(
  symbol: string,
  closeRaw: number,
  volumeMedio21: number,
  ultimoPregao = '2026-09-25',
): ResumoCotacao {
  return {
    symbol,
    ultimoPregao,
    closeRaw,
    volumeMedio21,
    pregoesComNegocio21: 21,
    baixaLiquidez: false,
    negociadoUltimos30: true,
  };
}

function emissor(cnpj: string, ehFinanceira: boolean): EmissorInfo {
  return {
    cnpj,
    nome: cnpj,
    mesFimExercicio: 12,
    raizes: [],
    setor: null,
    subsetor: null,
    segmento: null,
    segmentoListagem: null,
    ehFinanceira,
    ehBanco: ehFinanceira,
    escopoPreferido: ehFinanceira ? 'ind' : 'con',
  };
}

beforeEach(() => {
  dados.series = new Map();
  dados.liberacoes = new Set();
  dados.liberadosDesde = [];
  vi.mocked(serieRecenteCotacoes).mockClear();
  vi.mocked(simbolosComSaltoDePreco).mockClear();
  vi.mocked(conjuntoLiberacoes).mockClear();
  dados.acoes = [
    { symbol: 'WEGE3', cnpj: 'W', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
    { symbol: 'XPTO3', cnpj: 'X', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
    { symbol: 'XPTO4', cnpj: 'X', classeTitulo: 'PN', unitQtdOn: null, unitQtdPn: null },
  ];
  dados.fiis = [
    { symbol: 'HGLG11', cnpj: 'H', conferido: true, origem: 'b3_isin' },
    { symbol: 'FOFX11', cnpj: 'F', conferido: true, origem: 'b3_isin' },
    { symbol: 'NCON11', cnpj: 'N', conferido: false, origem: 'b3_nome' },
  ];
  dados.emissores = [emissor('W', false), emissor('X', true)];
  dados.contagens = Array.from({ length: 10 }, (_, i) => 2016 + i).flatMap((a) => [
    {
      cnpj: 'W',
      data: `${a}-12-31`,
      on: 4195e6,
      pn: 0,
      total: 4195e6,
      fonte: 'dfp',
      razaoLpa: 1,
      status: 'ok' as const,
    },
    {
      cnpj: 'X',
      data: `${a}-12-31`,
      on: 100e6,
      pn: 200e6,
      total: 300e6,
      fonte: 'dfp',
      razaoLpa: 1,
      status: 'ok' as const,
    },
  ]);
  dados.fund = [
    ...Array.from({ length: 10 }, (_, i) => fy('W', 2016 + i, 3000e6 + i * 300e6)),
    ...Array.from({ length: 10 }, (_, i) => fy('X', 2016 + i, 500e6)),
    { ...fy('W', 2026, 6200e6), tipoPeriodo: 'TTM', dtFim: '2026-06-30', anoFiscal: 2026 },
  ];
  dados.mensal = [
    mes('H', '2026-08-01', {}),
    mes('F', '2026-08-01', { tipoVigente: 'fof', reguaVigente: 'fora_do_indice' }),
    mes('N', '2026-08-01', {}),
  ];
  dados.resumos = [
    resumo('WEGE3', 52.3, 400e6),
    resumo('XPTO3', 10, 5e6),
    resumo('XPTO4', 9, 50e6),
    resumo('HGLG11', 158.2, 18e6),
    resumo('FOFX11', 9, 1e6),
    resumo('NCON11', 100, 1e5),
  ];
  const mensalHg = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 7 + i, 10)).toISOString().slice(0, 10);
    return {
      id: `hg-${i}`,
      symbol: 'HGLG11',
      source: 'BRAPI',
      tipo: 'RENDIMENTO',
      valor: 1.1,
      dataPagamento: d.replace(/-10$/, '-14'),
      dataExGravada: d.replace(/-10$/, '-01'),
      dataExOrigem: 'dataCom' as const,
    };
  });
  dados.proventos = [
    ...mensalHg,
    {
      id: 'w1',
      symbol: 'WEGE3',
      source: 'BRAPI',
      tipo: 'JCP',
      valor: 0.84,
      dataPagamento: '2026-03-10',
      dataExGravada: '2026-02-20',
      dataExOrigem: 'dataCom',
    },
    {
      id: 'y-old',
      symbol: 'FOFX11',
      source: 'YAHOO',
      tipo: 'Dividendo',
      valor: 0.07,
      dataPagamento: null,
      dataExGravada: '2026-08-03',
      dataExOrigem: 'date',
    },
  ];
});

describe('dataRef', () => {
  it('domingo ⇒ último pregão (sexta); sem cotação ⇒ pregão anterior', () => {
    expect(
      dataRefScores([{ ultimoPregao: '2026-09-25' }, { ultimoPregao: '2026-09-24' }], '2026-09-27'),
    ).toBe('2026-09-25');
    expect(dataRefScores([], '2026-09-27')).toBe('2026-09-25');
    expect(dataRefScores([], '2026-09-28')).toBe('2026-09-25');
  });
});

describe('executarScores', () => {
  it('grava scores do último pregão; FII não conferido sem score; FoF fora do Índice; índice por empresa', async () => {
    const { prisma, tabelas } = fakePrisma();
    const alertas: AlertaJob[] = [];
    const r = await executarScores(ctxDe(prisma, '2026-09-27', alertas), { tudo: true });
    expect(r.parcial).toBeUndefined();
    const scores = tabelas.assetScore;
    expect(new Set(scores.map((s) => (s.dataRef as Date).toISOString().slice(0, 10)))).toEqual(
      new Set(['2026-09-25']),
    );
    const simbolos = scores.map((s) => s.symbol).sort();
    expect(simbolos).toEqual(['FOFX11', 'HGLG11', 'WEGE3', 'XPTO3', 'XPTO4']);
    expect(simbolos).not.toContain('NCON11');

    const fof = scores.find((s) => s.symbol === 'FOFX11')!;
    expect(fof).toMatchObject({
      regua: 'fora_do_indice',
      indiceMf: null,
      checks: [],
      criteriosAplicaveis: 0,
    });

    const x3 = scores.find((s) => s.symbol === 'XPTO3')!;
    const x4 = scores.find((s) => s.symbol === 'XPTO4')!;
    expect(x3.tickerReferencia).toBe('XPTO4'); // maior volume médio
    expect(x3.indiceMf).toBe(x4.indiceMf);
    expect(x3.regua).toBe('acao_financeira');
    expect(x3.cDivida).toBeNull();
    expect(x3.criteriosAplicaveis).toBe(4);

    const hg = scores.find((s) => s.symbol === 'HGLG11')!;
    expect(hg.regua).toBe('fii_tijolo');
    expect(hg.criteriosAplicaveis).toBe(3);
    expect(hg.cRent).toBeNull();

    const det = r.detalhes as {
      scores: { fiis: { naoConferidos: number }; pctIncompleto: number };
    };
    expect(det.scores.fiis.naoConferidos).toBe(1);
    expect(typeof det.scores.pctIncompleto).toBe('number');

    // múltiplos atuais para todo o universo com preço (inclusive o FII não conferido)
    expect(tabelas.assetMultiplesCurrent.map((l) => l.symbol).sort()).toEqual([
      'FOFX11',
      'HGLG11',
      'NCON11',
      'WEGE3',
      'XPTO3',
      'XPTO4',
    ]);
    const wAtual = tabelas.assetMultiplesCurrent.find((l) => l.symbol === 'WEGE3')!;
    expect(wAtual.anosLucroConsecutivos).toBe(10);
    expect(wAtual.plPontosHistorico).toBe(10);
    expect(tabelas.assetMultiplesYearly.filter((l) => l.symbol === 'WEGE3')).toHaveLength(10);
    expect(tabelas.assetProventoAuditado.length).toBe(dados.proventos.length);
  });

  it('2ª execução no mesmo dia (sábado × domingo) regrava a mesma chave, sem duplicar', async () => {
    const { prisma, tabelas } = fakePrisma();
    await executarScores(ctxDe(prisma, '2026-09-26'), { tudo: true });
    const n1 = tabelas.assetScore.length;
    const chaves1 = tabelas.assetScore
      .map((s) => `${s.symbol}|${(s.dataRef as Date).toISOString()}`)
      .sort();
    await executarScores(ctxDe(prisma, '2026-09-27'), { tudo: true });
    expect(tabelas.assetScore.length).toBe(n1);
    expect(
      tabelas.assetScore.map((s) => `${s.symbol}|${(s.dataRef as Date).toISOString()}`).sort(),
    ).toEqual(chaves1);
    expect(tabelas.assetMultiplesCurrent.length).toBe(6);
  });

  it('linha Yahoo reinserida com id novo ⇒ símbolo reescrito, sem órfão', async () => {
    const { prisma, tabelas } = fakePrisma();
    await executarScores(ctxDe(prisma, '2026-09-27'), { etapas: ['proventos', 'eventos'] });
    expect(tabelas.assetProventoAuditado.some((l) => l.origemId === 'y-old')).toBe(true);
    dados.proventos = dados.proventos.map((x) => (x.id === 'y-old' ? { ...x, id: 'y-new' } : x));
    const r = await executarScores(ctxDe(prisma, '2026-09-27'), {
      etapas: ['proventos', 'eventos'],
    });
    const ids = tabelas.assetProventoAuditado.map((l) => l.origemId);
    expect(ids).toContain('y-new');
    expect(ids).not.toContain('y-old');
    expect(ids.length).toBe(dados.proventos.length);
    expect((r.detalhes as { proventos: { reescritos: number } }).proventos.reescritos).toBe(1);
    // nada mudou ⇒ nada reescrito
    const r3 = await executarScores(ctxDe(prisma, '2026-09-27'), {
      etapas: ['proventos', 'eventos'],
    });
    expect((r3.detalhes as { proventos: { reescritos: number } }).proventos.reescritos).toBe(0);
  });

  it('dry-run (aplicar=false) não grava nada', async () => {
    const { prisma, tabelas } = fakePrisma();
    await executarScores({ ...ctxDe(prisma, '2026-09-27'), aplicar: false }, { tudo: true });
    expect(Object.values(tabelas).every((t) => t.length === 0)).toBe(true);
  });

  it('retenção: apaga scores > 40 dias que não são o último dataRef do mês', async () => {
    const { prisma, tabelas } = fakePrisma();
    const velho = (d: string) => ({ symbol: 'WEGE3', dataRef: new Date(`${d}T00:00:00Z`) });
    tabelas.assetScore.push(
      velho('2026-07-15'),
      velho('2026-07-31'),
      velho('2026-08-10'),
      velho('2026-09-20'),
    );
    await executarScores(ctxDe(prisma, '2026-09-27'), { etapas: ['scores'] });
    const datas = tabelas.assetScore.map((s) => (s.dataRef as Date).toISOString().slice(0, 10));
    expect(datas).not.toContain('2026-07-15');
    expect(datas).toContain('2026-07-31');
    expect(datas).toContain('2026-08-10'); // < 40 dias
    expect(datas).toContain('2026-09-20');
  });
});

describe('scoreAcao — lacuna na sequência de lucro (achado qa-dados 30/09)', () => {
  it('ano ausente no meio da série ⇒ Índice incompleto com motivo lucro:serie_com_lacuna', async () => {
    const { scoreAcao } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const { ok } = await import('@/services/analiseAtivos/regras/comum/valor');
    const base = {
      m: { flags: [] },
      anos: ok(1),
      lucroUltimoFy: ok(4291.56e6),
      lpaTtm: ok(1.4),
      vpa: ok(5),
      dpa12m: ok(1),
      payoutPct: ok(70),
      plControladora: ok(10e9),
      flags: [],
    };
    const sem = scoreAcao({ ...base, anosLacuna: null }, false, SCORING_PARAMS_V1);
    const com = scoreAcao({ ...base, anosLacuna: 2024 }, false, SCORING_PARAMS_V1);
    expect(sem.indice.motivosIncompleto).not.toContain('lucro:serie_com_lacuna_2024');
    expect(com.indice.incompleto).toBe(true);
    expect(com.indice.motivosIncompleto).toContain('lucro:serie_com_lacuna_2024');
  });
});

describe('calcularAtualAcao — regra 13 na contagem dos múltiplos do dia (achado qa-dados 30/09)', () => {
  const cont = (data: string, total: number, fonte: string): ContagemAcoes => ({
    cnpj: 'X',
    data,
    on: total,
    pn: 0,
    total,
    fonte,
    razaoLpa: 1,
    status: 'ok',
  });
  async function calcular(contagens: ContagemAcoes[]) {
    const { calcularAtualAcao } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const ticker: TickerAcao = {
      symbol: 'PSSA3',
      cnpj: 'X',
      classeTitulo: 'ON',
      unitQtdOn: null,
      unitQtdPn: null,
    };
    return calcularAtualAcao(
      {
        ticker,
        resumo: {
          symbol: 'PSSA3',
          ultimoPregao: '2026-09-29',
          closeRaw: 47,
          volumeMedio21: 1e8,
          pregoesComNegocio21: 21,
          baixaLiquidez: false,
          negociadoUltimos30: true,
        },
        tickersEmpresa: [ticker],
        resumosEmpresa: new Map([['PSSA3', 47]]),
        fundAtual: null,
        fys: [],
        contagens,
        emissor: undefined,
        proventos: [],
        eventos: [],
        cobertura: undefined,
        historicoPl: [],
        dataRef: '2026-09-29',
      },
      SCORING_PARAMS_V1,
    );
  }

  it('PSSA3: ITR com 640 bi de ações contra 640 mi do DFP25 ⇒ sem nº de ações e flag', async () => {
    const r = await calcular([
      cont('2025-12-31', 640_360_000, 'dfp_x1000'),
      cont('2026-06-30', 640_992_323_000, 'itr_x1000'),
    ]);
    expect(r.flags).toContain('salto_acoes_sem_evento');
    expect(r.vpa.estado).not.toBe('ok');
  });

  it('contagem coerente com o DFP ⇒ sem flag', async () => {
    const r = await calcular([
      cont('2025-12-31', 640_360_000, 'dfp_x1000'),
      cont('2026-06-30', 640_992_323, 'itr'),
    ]);
    expect(r.flags).not.toContain('salto_acoes_sem_evento');
  });

  const naoVerif = (c: ContagemAcoes): ContagemAcoes => ({
    ...c,
    razaoLpa: null,
    status: 'nao_verificavel',
  });
  const fundPl = {
    receita: null,
    lucroBruto: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: null,
    lucroAtribuivel: null,
    ativoTotal: null,
    ativoCirculante: null,
    passivoCirculante: null,
    caixa: null,
    aplicacoesFinanceiras: null,
    dividaBrutaCp: null,
    dividaBrutaLp: null,
    fco: null,
    fci: null,
    fcf: null,
    capex: null,
    dividendosJcpPagos: null,
    dmplDeclarado: null,
    lpaOn: null,
    lpaPn: null,
    pl: 1_000_000_000,
    plControladora: 1_000_000_000,
    naoSeAplica: [],
    flags: [],
  };

  it('DFPs anteriores todos não verificáveis e contagem recente sem LPA ⇒ sem nº de ações, incompleto', async () => {
    const { calcularAtualAcao, scoreAcao } =
      await import('@/services/analiseAtivos/calculo/recalcularScores');
    const contagens = [
      naoVerif(cont('2024-12-31', 640_000_000, 'dfp')),
      naoVerif(cont('2025-12-31', 640_360_000, 'dfp')),
      naoVerif(cont('2026-06-30', 640_992_323_000, 'itr')),
    ];
    const r = await calcular(contagens);
    expect(r.flags).toContain('acoes_nao_verificavel');
    const comFund = calcularAtualAcao(
      { ...entradaMinima(contagens), fundAtual: fundPl as never },
      SCORING_PARAMS_V1,
    );
    expect(comFund.vpa.estado).not.toBe('ok');
    const sc = scoreAcao(comFund, false, SCORING_PARAMS_V1);
    expect(sc.indice.incompleto).toBe(true);
    expect(sc.indice.motivosIncompleto).toContain('acoes:nao_verificavel');
  });

  it('sem DFP de referência, mas a contagem recente bate com lucro × LPA (±5%) ⇒ usa a contagem', async () => {
    const { calcularAtualAcao } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const contagens = [
      naoVerif(cont('2025-12-31', 640_360_000, 'dfp')),
      { ...cont('2026-06-30', 640_992_323, 'itr'), razaoLpa: 1.02 },
    ];
    const r = calcularAtualAcao(
      { ...entradaMinima(contagens), fundAtual: fundPl as never },
      SCORING_PARAMS_V1,
    );
    expect(r.flags).not.toContain('acoes_nao_verificavel');
    expect(r.vpa.estado).toBe('ok');
  });

  it('fundamentos com escala declarada ambígua (não corrigida) ⇒ Índice incompleto', async () => {
    const { calcularAtualAcao, scoreAcao } =
      await import('@/services/analiseAtivos/calculo/recalcularScores');
    const contagens = [cont('2025-12-31', 640_360_000, 'dfp')];
    const r = calcularAtualAcao(
      {
        ...entradaMinima(contagens),
        fundAtual: { ...fundPl, flags: ['escala_ambigua'] } as never,
      },
      SCORING_PARAMS_V1,
    );
    expect(r.flags).toContain('escala_ambigua');
    const sc = scoreAcao(r, false, SCORING_PARAMS_V1);
    expect(sc.indice.incompleto).toBe(true);
    expect(sc.indice.motivosIncompleto).toContain('fundamentos:escala_ambigua');
  });

  function entradaMinima(contagens: ContagemAcoes[]) {
    const ticker: TickerAcao = {
      symbol: 'PSSA3',
      cnpj: 'X',
      classeTitulo: 'ON',
      unitQtdOn: null,
      unitQtdPn: null,
    };
    return {
      ticker,
      resumo: {
        symbol: 'PSSA3',
        ultimoPregao: '2026-09-29',
        closeRaw: 47,
        volumeMedio21: 1e8,
        pregoesComNegocio21: 21,
        baixaLiquidez: false,
        negociadoUltimos30: true,
      },
      tickersEmpresa: [ticker],
      resumosEmpresa: new Map([['PSSA3', 47]]),
      fundAtual: null,
      fys: [],
      contagens,
      emissor: undefined,
      proventos: [],
      eventos: [],
      cobertura: undefined,
      historicoPl: [],
      dataRef: '2026-09-29',
    };
  }
});

describe('calcularAtualFii — base de proventos parada (achado qa-dados 30/09)', () => {
  it('HGLG11 com a base parada em jun/2026 ⇒ rendimento 12m e meses AUSENTES (não subestimados)', async () => {
    const { calcularAtualFii } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const proventos = ['2026-03-31', '2026-04-30', '2026-05-28'].map((d, i) => ({
      origemId: String(i),
      symbol: 'HGLG11',
      source: 'BRAPI',
      tipoOriginal: 'RENDIMENTO',
      tipoNormalizado: 'RENDIMENTO' as const,
      valor: 1.1,
      dataPagamento: `${d.slice(0, 8)}28`,
      dataExGravada: d,
      dataComReal: d,
      status: 'valido' as const,
      duplicataDe: null,
      fatorAjusteHoje: 1,
      valorAjustadoHoje: 1.1,
      flags: [],
    }));
    const entrada = {
      resumo: {
        symbol: 'HGLG11',
        ultimoPregao: '2026-09-29',
        closeRaw: 148,
        volumeMedio21: 1e7,
        pregoesComNegocio21: 21,
        baixaLiquidez: false,
        negociadoUltimos30: true,
      },
      mesAtual: null,
      trimestre: null,
      proventos: proventos as never,
      eventos: [],
      cobertura: 'OK' as const,
      dataRef: '2026-09-29',
    };
    const parado = calcularAtualFii(
      { ...entrada, frescor: { verificadoEm: '2026-06-10', ultimaDataComDaClasse: '2026-06-10' } },
      SCORING_PARAMS_V1,
    );
    expect(parado.rend12m).toMatchObject({ estado: 'ausente', motivo: 'fonte_defasada' });
    expect(parado.meses).toMatchObject({ estado: 'ausente', motivo: 'fonte_defasada' });
    expect(parado.flags).toContain('proventos_defasados_base_parada');
    // sem frescor (memória antiga) o cálculo é o de antes
    const antes = calcularAtualFii(entrada, SCORING_PARAMS_V1);
    expect(antes.rend12m.estado).toBe('ok');
  });
});

describe('trava de plausibilidade do DY 12m (diagnóstico DY absurdo 02/10/2026)', () => {
  const prov = (symbol: string, valor: number, data: string, tipo = 'DIVIDENDO') => ({
    origemId: `${symbol}-${data}-${valor}`,
    symbol,
    source: 'BRAPI',
    tipoOriginal: tipo,
    tipoNormalizado: tipo as 'DIVIDENDO' | 'RENDIMENTO',
    valor,
    dataPagamento: data,
    dataExGravada: data,
    dataComReal: data,
    status: 'valido' as const,
    duplicataDe: null,
    fatorAjusteHoje: 1,
    valorAjustadoHoje: valor,
    flags: [] as string[],
  });
  const fund = {
    receita: 1e9,
    lucroLiquido: 2e8,
    lucroAtribuivel: 2e8,
    ebit: 3e8,
    depreciacaoAmortizacao: 5e7,
    ativoTotal: 3e9,
    ativoCirculante: 1e9,
    passivoCirculante: 5e8,
    caixa: 4e8,
    aplicacoesFinanceiras: 0,
    dividaBrutaCp: 1e8,
    dividaBrutaLp: 2e8,
    pl: 1e9,
    plControladora: 1e9,
    fco: 2.5e8,
    capex: 5e7,
    naoSeAplica: [],
    flags: [],
  };
  async function acao(symbol: string, dpa: number, dpaAnual?: unknown[]) {
    const { calcularAtualAcao } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const ticker: TickerAcao = {
      symbol,
      cnpj: symbol,
      classeTitulo: 'ON',
      unitQtdOn: null,
      unitQtdPn: null,
    };
    return calcularAtualAcao(
      {
        ticker,
        resumo: {
          symbol,
          ultimoPregao: '2026-09-29',
          closeRaw: 40,
          volumeMedio21: 1e8,
          pregoesComNegocio21: 21,
          baixaLiquidez: false,
          negociadoUltimos30: true,
        },
        tickersEmpresa: [ticker],
        resumosEmpresa: new Map([[symbol, 40]]),
        fundAtual: fund as never,
        fys: [],
        contagens: [
          {
            cnpj: symbol,
            data: '2025-12-31',
            on: 1e8,
            pn: 0,
            total: 1e8,
            fonte: 'dfp',
            razaoLpa: 1,
            status: 'ok',
          },
        ],
        emissor: undefined,
        proventos: [prov(symbol, dpa, '2025-12-15')] as never,
        eventos: [],
        cobertura: 'OK',
        historicoPl: [],
        dataRef: '2026-09-29',
        dpaAnual: dpaAnual as never,
      },
      SCORING_PARAMS_V1,
    );
  }

  it('DY 12m acima do teto (BMKS3 34%) ⇒ DY gravado com flag, fora do Índice e do semáforo', async () => {
    const { scoreAcao } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const c = await acao('BMKS3', 13.6); // 13,6 ÷ 40 = 34%
    expect(c.m.dyPct).toEqual({ estado: 'ok', valor: 34 });
    expect(c.flags).toContain('proventos_em_conferencia_dy_acima_teto');
    expect(c.dyIndice).toMatchObject({ estado: 'ausente', motivo: 'em_conferencia' });
    const s = scoreAcao(c, false, SCORING_PARAMS_V1);
    expect(s.indice.componentes.div).toMatchObject({ estado: 'ausente', nota: 0 });
    expect(s.indice.incompleto).toBe(true);
    expect(s.indice.motivosIncompleto).toContain('div:em_conferencia');
    expect(s.semaforo.checks.find((k) => k.codigo === 'dividendos')?.status).toBe('sem_dado');
  });

  it('o topo não é sustentado por DY suspeito: mesma empresa com DY 34% fica ABAIXO da de DY 8%', async () => {
    const { scoreAcao } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const suspeito = scoreAcao(await acao('AAAA3', 13.6), false, SCORING_PARAMS_V1);
    const normal = scoreAcao(await acao('BBBB3', 3.2), false, SCORING_PARAMS_V1); // 8%
    expect(normal.indice.componentes.div).toMatchObject({ estado: 'calculado', nota: 10 });
    const v = (r: typeof normal) => (r.indice.indice.estado === 'ok' ? r.indice.indice.valor : -1);
    expect(v(suspeito)).toBeLessThan(v(normal));
  });

  it('CEEB5 com DY acima do teto e referência CEEB3 normal ⇒ Índice da empresa incompleto (Quadro e Índice concordam)', async () => {
    const { comConferenciaDaEmpresa, scoreAcao } =
      await import('@/services/analiseAtivos/calculo/recalcularScores');
    const ref = await acao('CEEB3', 3.2); // 8%
    const pn = await acao('CEEB5', 12); // 30%
    expect(ref.flags.some((f) => f.startsWith('proventos_em_conferencia'))).toBe(false);
    expect(pn.flags).toContain('proventos_em_conferencia_dy_acima_teto');
    const empresa = comConferenciaDaEmpresa(ref, [ref, pn]);
    expect(empresa.dyIndice).toMatchObject({
      estado: 'ausente',
      motivo: 'em_conferencia',
      detalhe: 'dy_acima_teto',
    });
    const s = scoreAcao(empresa, false, SCORING_PARAMS_V1);
    expect(s.indice.incompleto).toBe(true);
    expect(s.indice.motivosIncompleto).toContain('div:em_conferencia');
    // sem ticker em conferência nada muda
    expect(comConferenciaDaEmpresa(ref, [ref, await acao('CEEB5', 3.5)])).toBe(ref);
  });

  it('provento_suspeito no último ano fechado (DPA 2025 = 3× 2024, payout 245%) ⇒ fora do Índice', async () => {
    const { scoreAcao } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const c = await acao('BALM4', 3.2, [
      { anoFiscal: 2023, dpaAjHoje: 0.33, payoutDmplPct: null },
      { anoFiscal: 2024, dpaAjHoje: 0.36, payoutDmplPct: null },
      { anoFiscal: 2025, dpaAjHoje: 5.07, payoutDmplPct: 245 },
    ]);
    expect(c.m.dyPct).toEqual({ estado: 'ok', valor: 8 });
    expect(c.flags).toContain('proventos_em_conferencia_salto_recente');
    const s = scoreAcao(c, false, SCORING_PARAMS_V1);
    expect(s.indice.motivosIncompleto).toContain('div:em_conferencia');
    // sem a série anual (memória antiga) só o teto vale
    const semSerie = await acao('BALM4', 3.2);
    expect(semSerie.flags.some((f) => f.startsWith('proventos_em_conferencia'))).toBe(false);
  });

  it('FII com DY 12m acima de 20% ⇒ flag e DY fora do Índice; 12% passa', async () => {
    const { calcularAtualFii } = await import('@/services/analiseAtivos/calculo/recalcularScores');
    const meses = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
    const entrada = (valor: number) => ({
      resumo: {
        symbol: 'LRDI11',
        ultimoPregao: '2026-09-29',
        closeRaw: 100,
        volumeMedio21: 1e5,
        pregoesComNegocio21: 16,
        baixaLiquidez: false,
        negociadoUltimos30: true,
      },
      mesAtual: null,
      trimestre: null,
      proventos: meses.map((m) => prov('LRDI11', valor, `${m}-15`, 'RENDIMENTO')) as never,
      eventos: [],
      cobertura: 'OK' as const,
      dataRef: '2026-09-29',
    });
    const alto = calcularAtualFii(entrada(7), SCORING_PARAMS_V1); // 42%
    expect(alto.flags).toContain('proventos_em_conferencia_dy_acima_teto');
    expect(alto.dyIndice).toMatchObject({ estado: 'ausente', motivo: 'em_conferencia' });
    const normal = calcularAtualFii(entrada(2), SCORING_PARAMS_V1); // 12%
    expect(normal.flags.some((f) => f.startsWith('proventos_em_conferencia'))).toBe(false);
    expect(normal.dyIndice).toEqual({ estado: 'ok', valor: 12 });
  });

  it('mesesInformePorAno conta meses distintos por ano', async () => {
    const { mesesInformePorAno } =
      await import('@/services/analiseAtivos/calculo/recalcularScores');
    expect(
      mesesInformePorAno([
        { refMonth: '2024-11-01' },
        { refMonth: '2024-12-01' },
        { refMonth: '2024-12-01' },
        { refMonth: '2025-01-01' },
      ]),
    ).toEqual({ 2024: 2, 2025: 1 });
  });
});

describe('bloco C — motor de sanidade no job scores', () => {
  /** XPTO4 (referência da empresa X) com a base de cotação ×0,20 sem evento (o caso SBSP3). */
  function serieComSalto() {
    const dias = ['2026-04-24', '2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30'];
    const depois = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];
    return [
      ...dias.slice(0, 3).map((date) => ({ date, closeRaw: 45, negocios: 900 })),
      ...[dias[3], dias[4], ...depois].map((date) => ({ date, closeRaw: 9, negocios: 900 })),
    ];
  }
  const semTempo = (linhas: Record<string, unknown>[]) =>
    JSON.stringify(
      linhas.map(({ calculadoEm: _c, computedAt: _t, ...resto }) => resto),
      (_k, v) => (v instanceof Date ? v.toISOString() : v),
    );

  it('REGRESSÃO v1: nada do motor é lido e as tabelas saem idênticas com dados que disparariam as regras', async () => {
    const a = fakePrisma();
    await executarScores(ctxDe(a.prisma, '2026-09-27'), { tudo: true });
    dados.series = new Map([['XPTO4', serieComSalto()]]);
    dados.liberacoes = new Set(['XPTO4|base_sem_evento|2026-04-29']);
    const b = fakePrisma();
    const r = await executarScores(ctxDe(b.prisma, '2026-09-27'), { tudo: true });
    expect(serieRecenteCotacoes).not.toHaveBeenCalled();
    expect(simbolosComSaltoDePreco).not.toHaveBeenCalled();
    expect(conjuntoLiberacoes).not.toHaveBeenCalled();
    for (const t of ['assetMultiplesCurrent', 'assetScore', 'assetMultiplesYearly']) {
      expect(semTempo(b.tabelas[t])).toBe(semTempo(a.tabelas[t]));
    }
    expect(JSON.stringify(b.tabelas.assetMultiplesCurrent)).not.toMatch(/"(conf|rev|info):/);
    expect((r.detalhes as { scores: { sanidade?: unknown } }).scores.sanidade).toBeUndefined();
  });

  it('v2: preco_base na referência ⇒ flag no ticker, Índice da empresa em conferência, relatório e alerta', async () => {
    dados.series = new Map([['XPTO4', serieComSalto()]]);
    const { prisma, tabelas } = fakePrisma();
    const alertas: AlertaJob[] = [];
    const ctx = {
      ...ctxDe(prisma, '2026-09-27', alertas),
      params: SCORING_PARAMS_V2,
      paramsVersion: 2,
    };
    const r = await executarScores(ctx, { tudo: true });
    expect(conjuntoLiberacoes).toHaveBeenCalledTimes(1);
    const x4 = tabelas.assetMultiplesCurrent.find((l) => l.symbol === 'XPTO4')!;
    expect(x4.flags).toContain('conf:preco_base:base_sem_evento@2026-04-29');
    // escopo ticker: só a XPTO4 tem a flag, mas ela é a referência ⇒ a empresa toda fica incompleta
    expect(tabelas.assetMultiplesCurrent.find((l) => l.symbol === 'XPTO3')!.flags).not.toContain(
      'conf:preco_base:base_sem_evento@2026-04-29',
    );
    for (const s of ['XPTO3', 'XPTO4']) {
      const sc = tabelas.assetScore.find((l) => l.symbol === s)!;
      expect(sc.incompleto).toBe(true);
      expect(sc.motivosIncompleto).toEqual(
        expect.arrayContaining(['div:em_conferencia', 'preco:em_conferencia']),
      );
    }
    // a WEGE3 (outra empresa) não ganha conferência
    expect(
      (tabelas.assetScore.find((l) => l.symbol === 'WEGE3')!.motivosIncompleto as string[]).filter(
        (m) => m.endsWith(':em_conferencia'),
      ),
    ).toEqual([]);
    const san = (
      r.detalhes as {
        scores: { sanidade: { regras: Array<{ regra: string; acao: number }>; totais: unknown } };
      }
    ).scores.sanidade;
    expect(san.regras.find((x) => x.regra === 'conf:preco_base:base_sem_evento')?.acao).toBe(1);
    expect(alertas.map((a) => a.codigo)).toContain('sanidade_regra_acima_limite');
  });

  it('v2 com a liberação da curadoria para a mesma chave ⇒ não marca', async () => {
    dados.series = new Map([['XPTO4', serieComSalto()]]);
    dados.liberacoes = new Set(['XPTO4|base_sem_evento|2026-04-29']);
    const { prisma, tabelas } = fakePrisma();
    const ctx = { ...ctxDe(prisma, '2026-09-27'), params: SCORING_PARAMS_V2, paramsVersion: 2 };
    await executarScores(ctx, { tudo: true });
    const x4 = tabelas.assetMultiplesCurrent.find((l) => l.symbol === 'XPTO4')!;
    expect((x4.flags as string[]).filter((f) => f.startsWith('conf:'))).toEqual([]);
  });

  it('v2 incremental: emissor com liberação nova desde o último OK entra nos derivados', async () => {
    vi.mocked(ultimaExecucaoOkPorJob).mockResolvedValueOnce(
      new Map([['scores', new Date('2026-09-26T10:10:00Z')]]),
    );
    const empresas = (r: Awaited<ReturnType<typeof executarScores>>) =>
      (r.detalhes as { derivados: { empresas: number } }).derivados.empresas;
    const ctxV2 = () => ({
      ...ctxDe(fakePrisma().prisma, '2026-09-27'),
      params: SCORING_PARAMS_V2,
      paramsVersion: 2,
    });
    const sem = empresas(await executarScores(ctxV2()));
    vi.mocked(ultimaExecucaoOkPorJob).mockResolvedValueOnce(
      new Map([['scores', new Date('2026-09-26T10:10:00Z')]]),
    );
    dados.liberadosDesde = ['XPTO4'];
    const com = empresas(await executarScores(ctxV2()));
    expect(simbolosLiberadosDesde).toHaveBeenCalled();
    expect(com).toBe(sem + 1);

    // v1 (sem conferência): nem consulta
    vi.mocked(simbolosLiberadosDesde).mockClear();
    vi.mocked(ultimaExecucaoOkPorJob).mockResolvedValueOnce(
      new Map([['scores', new Date('2026-09-26T10:10:00Z')]]),
    );
    expect(empresas(await executarScores(ctxDe(fakePrisma().prisma, '2026-09-27')))).toBe(sem);
    expect(simbolosLiberadosDesde).not.toHaveBeenCalled();
  });
});
