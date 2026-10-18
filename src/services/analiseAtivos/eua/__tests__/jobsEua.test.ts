/**
 * Jobs EUA da fatia A com Prisma em memória e cliente SEC falso (fixtures, sem rede):
 * - sec-fundamentos: versao +1 só quando o FY muda; incremental pelo índice diário + pendentes;
 * - sec-cadastro: universo por CIK, ticker da SEC, submissions só do que mudou;
 * - cotacoes-eua: 'pulado' sem a chave (sem tocar em banco nem provedor); fechamento ≥ 16h30 ET.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { CompanyFactsSec } from '@/services/analiseAtivos/eua/extrairFundamentosSec';
import {
  MOTIVO_SEM_CHAVE,
  sincronizarCotacoesEua,
} from '@/services/analiseAtivos/eua/jobs/cotacoesEua';
import {
  anoDoAccession,
  floatsVigentes,
  maisRecentePorCik,
  resumirSubmissions,
  sincronizarSecCadastro,
  tickersPorCik,
  trimestresFechados,
  type ArquivoTickersBolsa,
  type SubmissionsSec,
} from '@/services/analiseAtivos/eua/jobs/secCadastro';
import {
  diasDoIndice,
  lerIndiceDiario,
  processarCikSec,
  sincronizarSecFundamentos,
  urlIndiceDiario,
} from '@/services/analiseAtivos/eua/jobs/secFundamentos';
import { cotacaoDaBrapi } from '@/services/analiseAtivos/eua/precos/fonteBrapiEua';
import {
  ehFechamentoEua,
  fontePrecoEuaConfigurada,
} from '@/services/analiseAtivos/eua/precos/fontePrecoEua';
import type { RespostaSec, SecCliente } from '@/services/analiseAtivos/eua/secCliente';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import { UNIVERSO_EUA_PADRAO } from '@/types/analiseAtivosEua';
import { criarPrismaFakeEua } from './prismaFakeEua';

const FIX = path.join(__dirname, 'fixtures');
const ler = (rel: string) => readFileSync(path.join(FIX, rel), 'utf8');
const cf = (nome: string): CompanyFactsSec => JSON.parse(ler(`companyfacts/${nome}.json`));

function ctxDe(prisma: PrismaClient, extra: Partial<JobContexto> = {}) {
  const alertas: AlertaJob[] = [];
  const contagem = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (c, n = 1) => {
      contagem[c] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-18',
    origem: 'script',
    aplicar: true,
    ...extra,
  };
  return { ctx, alertas, contagem };
}

/** Cliente SEC falso: mapa URL → corpo; o resto é 404. */
function clienteFalso(rotas: (url: string) => string | null): SecCliente & { urls: string[] } {
  const urls: string[] = [];
  const obter = async (url: string): Promise<RespostaSec> => {
    urls.push(url);
    const t = rotas(url);
    return t === null
      ? { status: 404, texto: null, etag: null, lastModified: null }
      : { status: 200, texto: t, etag: null, lastModified: null };
  };
  return {
    urls,
    obter,
    async obterJson<T>(url: string) {
      const r = await obter(url);
      return r.texto === null ? null : (JSON.parse(r.texto) as T);
    },
    requisicoes: () => urls.length,
  };
}

// ---------------------------------------------------------------------------
describe('sec-fundamentos', () => {
  it('versao +1 só quando o FY muda (reapresentação), nunca duplica', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    const base = cf('AAPL');
    const r1 = await processarCikSec(prisma, '320193', {
      cf: base,
      anoMinimo: 2014,
      aplicar: true,
    });
    expect(r1).toMatchObject({ status: 'ok', periodos: 12, novasVersoes: 12 });
    const r2 = await processarCikSec(prisma, '320193', {
      cf: cf('AAPL'),
      anoMinimo: 2014,
      aplicar: true,
    });
    expect(r2.novasVersoes).toBe(0);

    // 10-K/A reapresenta a receita de FY2024
    const alterado = cf('AAPL');
    const rec =
      alterado.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD;
    rec.push({
      ...rec.find((f) => f.end === '2024-09-28')!,
      val: 391_000_000_000,
      form: '10-K/A',
      filed: '2026-12-01',
      accn: '0000320193-26-999999',
    });
    const r3 = await processarCikSec(prisma, '320193', {
      cf: alterado,
      anoMinimo: 2014,
      aplicar: true,
    });
    expect(r3.novasVersoes).toBe(1);
    const fy24 = tabelas.assetFundamentalsPeriod.filter((l) =>
      (l.dtFim as Date).toISOString().startsWith('2024-09-28'),
    );
    expect(fy24.map((l) => l.versao).sort()).toEqual([1, 2]);
    const v2 = fy24.find((l) => l.versao === 2)!;
    expect(v2).toMatchObject({
      source: 'SEC',
      docTipo: '10-K',
      emissorId: 'CIK:0000320193',
      escopo: 'con',
      padraoContabil: 'USGAAP',
      moeda: 'USD',
      escalaOriginal: 'UNIDADE',
      tipoPeriodo: 'FY',
      anoFiscal: 2024,
      accession: '0000320193-26-999999',
    });
    expect(String(v2.receita)).toBe('391000000000');
    expect(tabelas.assetFundamentalsPeriod).toHaveLength(13);
  });

  it('dry-run (aplicar=false) conta e não grava', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    const r = await processarCikSec(prisma, '21344', {
      cf: cf('KO'),
      anoMinimo: 2014,
      aplicar: false,
    });
    expect(r.novasVersoes).toBe(12);
    expect(tabelas.assetFundamentalsPeriod).toHaveLength(0);
  });

  it('incremental: CIKs do índice diário com 10-K + quem ainda não tem dado; cursor avança', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    tabelas.secCompany.push(
      {
        cik: '0001467373',
        nome: 'Accenture',
        noUniverso: true,
        cikHistorico: null,
        classe: 'stock',
      },
      { cik: '0000320193', nome: 'Apple', noUniverso: true, cikHistorico: null, classe: 'stock' },
      {
        cik: '0000021344',
        nome: 'Coca-Cola',
        noUniverso: true,
        cikHistorico: null,
        classe: 'stock',
      },
    );
    // Accenture e KO já têm dados; AAPL não
    tabelas.assetFundamentalsPeriod.push(
      { emissorId: 'CIK:0001467373', source: 'SEC' },
      { emissorId: 'CIK:0000021344', source: 'SEC' },
    );
    const acn = { ...cf('KO'), cik: 1467373, entityName: 'Accenture plc' };
    const cli = clienteFalso((url) => {
      if (url === urlIndiceDiario('2026-10-16')) return ler('sec/form.20261016.idx');
      if (url.endsWith('CIK0000320193.json')) return ler('companyfacts/AAPL.json');
      if (url.endsWith('CIK0001467373.json')) return JSON.stringify(acn);
      return null;
    });
    const { ctx } = ctxDe(prisma);
    const r = await sincronizarSecFundamentos(ctx, {
      cliente: cli,
      cursor: async () => '2026-10-15',
    });
    expect(r.detalhes).toMatchObject({
      cursor: '2026-10-17',
      cursorAnterior: '2026-10-15',
      indicesLidos: 1,
      ciksDoIndice: 1,
      pendentes: 2,
      processados: 2,
    });
    expect(cli.urls.filter((u) => u.includes('companyfacts'))).toHaveLength(2); // KO não
    expect(cli.urls.some((u) => u.includes('form.20261017.idx'))).toBe(true);
  });

  it('universo vazio ⇒ pulado', async () => {
    const { prisma } = criarPrismaFakeEua();
    const r = await sincronizarSecFundamentos(ctxDe(prisma).ctx, {
      cliente: clienteFalso(() => null),
    });
    expect(r.pulado).toContain('universo EUA vazio');
  });

  it('índice diário: largura fixa, formulário com espaço, data AAAAMMDD', () => {
    const l = lerIndiceDiario(ler('sec/form.20261016.idx'));
    expect(l.find((x) => x.cik === '0001467373')).toEqual({
      form: '10-K',
      cik: '0001467373',
      data: '2026-10-16',
    });
    expect(l.some((x) => x.form === '1-A/A')).toBe(true);
    const sintetico = [
      'Form Type   Company Name   CIK   Date Filed  File Name',
      '-------------------------------------------------------',
      'SC 13G/A         ALGUMA EMPRESA INC                       123456      20261016    edgar/data/123456/x.txt',
      '10-KT            OUTRA  CORP                               98765      2026-10-16  edgar/data/98765/y.txt',
      'linha quebrada',
    ].join('\n');
    expect(lerIndiceDiario(sintetico)).toEqual([
      { form: 'SC 13G/A', cik: '0000123456', data: '2026-10-16' },
      { form: '10-KT', cik: '0000098765', data: '2026-10-16' },
    ]);
    expect(l.filter((x) => x.form === '10-K/A').length).toBe(1);
    expect(diasDoIndice('2026-10-15', '2026-10-18')).toEqual(['2026-10-16', '2026-10-17']);
    expect(diasDoIndice('2026-01-01', '2026-10-18', 3)).toEqual([
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
    expect(urlIndiceDiario('2026-10-16')).toBe(
      'https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261016.idx',
    );
  });
});

// ---------------------------------------------------------------------------
describe('sec-cadastro', () => {
  const frames = new Set([
    'float_CY2025Q2I',
    'float_CY2025Q1I',
    'float_CY2026Q1I',
    'shares_CY2025Q4I',
    'shares_CY2025Q3I',
    'shares_CY2026Q1I',
    'assets_CY2025Q4I',
    'assets_CY2025Q2I',
  ]);
  const floatsFixture = maisRecentePorCik(
    ['float_CY2025Q2I', 'float_CY2025Q1I', 'float_CY2026Q1I'].map((f) =>
      JSON.parse(ler(`sec/${f}.json`)),
    ),
  );
  const subsReais = new Set(['0000320193', '0002115436', '0001687229', '0000915912']);
  /** submissions mínimo: o 10-K mais recente = accession do float (incremental estável) */
  const subsFalso = (cik: string): SubmissionsSec => ({
    cik,
    name: `CIK ${cik}`,
    sic:
      {
        '0000019617': '6021',
        '0000036146': '6022',
        '0000726728': '6798',
        '0000906107': '6798',
        '0001045609': '6798',
        '0001423689': '6798',
        '0001981792': '6798',
        '0001326160': '4911',
        '0001652044': '7370',
        '0001067983': '6331',
        '0001720424': '7372',
      }[cik] ?? '3571',
    fiscalYearEnd: '1231',
    filings: {
      recent: {
        form: ['10-K'],
        accessionNumber: [floatsFixture.get(cik)?.accn ?? 'x'],
        filingDate: ['2026-02-15'],
      },
    },
  });
  const rotas = (url: string) => {
    if (url.endsWith('company_tickers_exchange.json'))
      return ler('sec/company_tickers_exchange.json');
    const fr = /frames\/(?:dei|us-gaap)\/(\w+)\/\w+\/(CY\w+)\.json$/.exec(url);
    if (fr) {
      const pref = {
        EntityPublicFloat: 'float',
        EntityCommonStockSharesOutstanding: 'shares',
        Assets: 'assets',
      }[fr[1]];
      const k = `${pref}_${fr[2]}`;
      return frames.has(k) ? ler(`sec/${k}.json`) : null;
    }
    const sb = /submissions\/CIK(\d{10})\.json$/.exec(url);
    if (sb)
      return subsReais.has(sb[1])
        ? ler(`sec/submissions_CIK${sb[1]}.json`)
        : JSON.stringify(subsFalso(sb[1]));
    return null;
  };

  it('universo por CIK: ticker da SEC, histerese, overrides e sanidade do float', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    const cli = clienteFalso(rotas);
    const { ctx, alertas } = ctxDe(prisma);
    const r = await sincronizarSecCadastro(ctx, {
      cliente: cli,
      universo: async () => UNIVERSO_EUA_PADRAO,
    });
    expect(r.parcial).toBeUndefined();
    const emp = (cik: string) => tabelas.secCompany.find((l) => l.cik === cik)!;
    const tk = (cik: string) =>
      tabelas.secCompanyTicker
        .filter((t) => t.cik === cik && t.validTo === null)
        .map((t) => t.symbol);

    expect(emp('0000320193')).toMatchObject({
      noUniverso: true,
      classe: 'stock',
      exercicioFimMmdd: '0926',
      bolsa: 'Nasdaq',
      floatSanidade: 'ok',
    });
    expect(tk('0001652044')).toEqual(['GOOGL', 'GOOG']);
    expect(tk('0000019617')).toEqual(['JPM']);
    expect(emp('0000019617').ehFinanceira).toBe(true);
    expect(tk('0001067983')).toEqual(['BRK-B', 'BRK-A']);
    expect(emp('0002115436')).toMatchObject({
      noUniverso: true,
      cikHistorico: '0000034088',
      origem: 'override',
    });
    expect(tk('0002115436')).toEqual(['XOM']);
    expect(emp('0000906107')).toMatchObject({
      classe: 'reit',
      segmento: 'residencial',
      noUniverso: true,
    });
    expect(tk('0000906107')).toEqual(['VMRK']); // ticker da SEC, não do override
    expect(emp('0001687229')).toMatchObject({ classe: 'reit', noUniverso: true });
    expect(emp('0001423689')).toMatchObject({ noUniverso: false, foraMotivo: 'hipotecario' });
    expect(emp('0000036146')).toMatchObject({ noUniverso: false, foraMotivo: 'float_suspeito' });
    expect(emp('0001720424')).toMatchObject({ noUniverso: false, foraMotivo: 'float_suspeito' }); // HIVE
    expect(emp('0000915912')).toMatchObject({ noUniverso: false, foraMotivo: 'sem_bolsa' }); // AVB
    expect(emp('0001981792')).toMatchObject({ classe: 'stock', noUniverso: true }); // HHH
    expect(tk('0001326160')).toEqual(['DUK']); // DUKB = dívida listada
    expect(
      tabelas.secCompanyTicker.every(
        (t) => t.symbolNorm === String(t.symbol).replace(/[^A-Z]/g, ''),
      ),
    ).toBe(true);
    const codigos = alertas.map((a) => a.codigo);
    expect(codigos).toEqual(
      expect.arrayContaining(['float_suspeito', 'override_sem_ticker', 'ticker_sem_10k']),
    );

    // 2ª rodada: submissions só de quem não tem como confirmar o 10-K pelo float — CIK fora do
    // arquivo de tickers (AVB; CXW não está no recorte da fixture) e a holding XOM, cujo float vem
    // do CIK histórico
    const cli2 = clienteFalso(rotas);
    const r2 = await sincronizarSecCadastro(ctxDe(prisma).ctx, {
      cliente: cli2,
      universo: async () => UNIVERSO_EUA_PADRAO,
    });
    expect(cli2.urls.filter((u) => u.includes('submissions'))).toEqual([
      'https://data.sec.gov/submissions/CIK0000915912.json',
      'https://data.sec.gov/submissions/CIK0001070985.json',
      'https://data.sec.gov/submissions/CIK0002115436.json',
    ]);
    expect(r2.detalhes?.submissions).toBe(3);
    expect(tabelas.secCompanyTicker.filter((t) => t.validTo !== null)).toHaveLength(0);
  });

  it('quem estava no universo e sumiu dos candidatos sai (float_abaixo); ticker trocado fecha vigência', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    tabelas.secCompany.push({
      cik: '0000000042',
      nome: 'Delistada',
      noUniverso: true,
      sic: 3571,
      ultimo10k: null,
      publicFloatUsd: null,
      ultimo10kEm: null,
    });
    tabelas.secCompanyTicker.push({
      id: 't1',
      cik: '0000320193',
      symbol: 'AAPLX',
      symbolNorm: 'AAPLX',
      principal: true,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validTo: null,
    });
    const r = await sincronizarSecCadastro(ctxDe(prisma).ctx, {
      cliente: clienteFalso(rotas),
      universo: async () => UNIVERSO_EUA_PADRAO,
    });
    expect(r.detalhes?.saidas).toBe(0); // estava sem ticker no arquivo ⇒ candidato, decidido 'sem_bolsa'
    expect(tabelas.secCompany.find((l) => l.cik === '0000000042')).toMatchObject({
      noUniverso: false,
      foraMotivo: 'sem_bolsa',
    });
    expect(tabelas.secCompanyTicker.find((t) => t.id === 't1')!.validTo).toEqual(
      new Date('2026-10-18T00:00:00Z'),
    );
  });

  it('float antigo só vale quando veio de 10-K recente (AMD repetiu o float de jun/2024 em 2026)', () => {
    const recentes = new Map([
      ['0000320193', { val: 3e12, end: '2025-03-28', accn: '0000320193-25-000079' }],
    ]);
    const antigos = new Map([
      ['0000002488', { val: 232.3e9, end: '2024-06-28', accn: '0000002488-26-000018' }],
      ['0000000099', { val: 5e9, end: '2024-06-28', accn: '0000000099-24-000001' }],
      ['0000320193', { val: 1, end: '2024-03-29', accn: '0000320193-24-000001' }],
    ]);
    const v = floatsVigentes(recentes, antigos, '2026-10-18');
    expect([...v.keys()].sort()).toEqual(['0000002488', '0000320193']);
    expect(v.get('0000320193')!.val).toBe(3e12);
    expect(anoDoAccession('0000002488-26-000018')).toBe(2026);
    expect(anoDoAccession('x')).toBeNull();
  });

  it('funções puras: trimestres, tickers por CIK, submissions', () => {
    expect(trimestresFechados('2026-10-18', 3)).toEqual(['CY2026Q3I', 'CY2026Q2I', 'CY2026Q1I']);
    expect(trimestresFechados('2026-01-05', 2)).toEqual(['CY2025Q4I', 'CY2025Q3I']);
    const arq = JSON.parse(ler('sec/company_tickers_exchange.json')) as ArquivoTickersBolsa;
    expect(
      tickersPorCik(arq)
        .get('0001652044')!
        .tickers.map((t) => t.symbol),
    ).toEqual(['GOOGL', 'GOOG', 'GOOGM', 'GOOGN']);
    expect(() => tickersPorCik({ fields: ['x'], data: [] })).toThrow(/layout/);
    const s = resumirSubmissions(JSON.parse(ler('sec/submissions_CIK0000320193.json')));
    expect(s).toMatchObject({
      sic: 3571,
      exercicioFimMmdd: '0926',
      ultimo10k: '0000320193-25-000079',
      ultimo10kEm: '2025-10-31',
    });
    expect(
      resumirSubmissions(JSON.parse(ler('sec/submissions_CIK0000915912.json'))).tickers,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('cotacoes-eua', () => {
  const proibido = new Proxy(
    {},
    {
      get: (_a, p) => {
        throw new Error(`tocou prisma.${String(p)}`);
      },
    },
  ) as PrismaClient;

  it("sem ANALISE_ATIVOS_EUA_PRECO_HABILITADO ⇒ 'pulado', sem banco e sem provedor", async () => {
    const fonte = vi.fn();
    const r = await sincronizarCotacoesEua(ctxDe(proibido).ctx, { fonte });
    expect(r).toEqual({ pulado: MOTIVO_SEM_CHAVE });
    expect(fonte).not.toHaveBeenCalled();
  });

  it('com a chave: grava só o candle que já é fechamento (≥ 16h30 ET)', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    tabelas.secCompany.push(
      {
        cik: '0000320193',
        nome: 'Apple',
        noUniverso: true,
        classe: 'stock',
        sic: 3571,
        ehFinanceira: false,
        bolsa: 'Nasdaq',
        segmento: null,
        exercicioFimMmdd: '0926',
        publicFloatUsd: null,
        publicFloatData: null,
        cikHistorico: null,
      },
      {
        cik: '0001067983',
        nome: 'BRK',
        noUniverso: true,
        classe: 'stock',
        sic: 6331,
        ehFinanceira: true,
        bolsa: 'NYSE',
        segmento: null,
        exercicioFimMmdd: '1231',
        publicFloatUsd: null,
        publicFloatData: null,
        cikHistorico: null,
      },
    );
    tabelas.secCompanyTicker.push(
      {
        id: 'a',
        cik: '0000320193',
        symbol: 'AAPL',
        symbolNorm: 'AAPL',
        principal: true,
        validTo: null,
      },
      {
        id: 'b',
        cik: '0001067983',
        symbol: 'BRK-B',
        symbolNorm: 'BRKB',
        principal: true,
        validTo: null,
      },
    );
    const pedidos: string[][] = [];
    const fonte = async () => ({
      id: 'brapi' as const,
      async cotacoes(symbols: readonly string[]) {
        pedidos.push([...symbols]);
        return [
          {
            symbol: 'AAPL',
            data: '2026-10-16',
            fechamento: 250.1,
            ajustado: null,
            volume: 1e6,
            momento: '2026-10-16T20:00:00Z',
          },
          {
            symbol: 'BRK.B',
            data: '2026-10-19',
            fechamento: 480,
            ajustado: null,
            volume: null,
            momento: '2026-10-19T15:00:00Z',
          },
        ];
      },
    });
    const r = await sincronizarCotacoesEua(ctxDe(prisma).ctx, {
      habilitado: () => true,
      fonte,
      agora: () => new Date('2026-10-19T16:00:00Z'), // 12h em NY: o candle de 19/10 é intradiário
    });
    expect(pedidos).toEqual([['AAPL', 'BRK.B']]);
    expect(r.detalhes).toMatchObject({ recebidas: 2, gravadas: 1, intradiarias: 1 });
    expect(tabelas.assetQuoteDailyUs).toHaveLength(1);
    expect(tabelas.assetQuoteDailyUs[0]).toMatchObject({ symbol: 'AAPL', source: 'brapi' });
  });

  it('fechamento ≥ 16h30 em Nova York (horário de verão e de inverno)', () => {
    expect(ehFechamentoEua('2026-10-16', new Date('2026-10-16T20:29:00Z'))).toBe(false); // 16:29 EDT
    expect(ehFechamentoEua('2026-10-16', new Date('2026-10-16T20:31:00Z'))).toBe(true);
    expect(ehFechamentoEua('2026-12-01', new Date('2026-12-01T21:29:00Z'))).toBe(false); // 16:29 EST
    expect(ehFechamentoEua('2026-12-01', new Date('2026-12-01T21:30:00Z'))).toBe(true);
    expect(ehFechamentoEua('2026-10-16', new Date('2026-10-17T13:00:00Z'))).toBe(true);
  });

  it('BRAPI: só USD; ticker com classe volta na forma da Análise; fonte padrão brapi', () => {
    const q = {
      symbol: 'BRK-B',
      shortName: '',
      currency: 'USD',
      regularMarketPrice: 480,
      regularMarketTime: '2026-10-16T20:00:00.000Z',
      regularMarketVolume: 10,
    };
    expect(cotacaoDaBrapi(q)).toMatchObject({
      symbol: 'BRK.B',
      data: '2026-10-16',
      fechamento: 480,
      volume: 10,
    });
    expect(cotacaoDaBrapi({ ...q, currency: 'BRL' })).toBeNull();
    expect(cotacaoDaBrapi({ ...q, regularMarketPrice: 0 })).toBeNull();
    expect(fontePrecoEuaConfigurada({})).toBe('brapi');
    expect(fontePrecoEuaConfigurada({ ANALISE_EUA_PRECO_FONTE: 'eodhd' })).toBe('eodhd');
    expect(fontePrecoEuaConfigurada({ ANALISE_EUA_PRECO_FONTE: 'xpto' })).toBe('brapi');
  });
});
