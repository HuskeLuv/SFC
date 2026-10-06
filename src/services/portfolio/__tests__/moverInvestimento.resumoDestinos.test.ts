import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Refatoração PURA do mover (destino na importação Open Finance, fatia A):
 * resumoDestinos/planejarMover extraídos de obterOpcoesMover/moverInvestimento.
 * Os snapshots abaixo foram gerados ANTES da extração — o payload do GET
 * /api/carteira/mover precisa continuar idêntico (chave da fase 2 ligada e
 * desligada).
 */

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn() },
  watchlist: { findFirst: vi.fn(), update: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  asset: { findUnique: vi.fn() },
  userChangeLog: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
const mockPricer = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: mockPricer,
}));
vi.mock('@/services/saudeFinanceira/saudeFinanceiraServer', () => ({
  buildSaudeFinanceira: vi.fn(),
}));

import {
  carregarItemMover,
  estadoAtualDe,
  exigirEstadoMovivel,
  moverInvestimento,
  obterOpcoesMover,
  planejarMover,
  resumoDestinos,
  MSG_ABA_FORA_DA_FASE,
  MSG_ESCOLHA_SECAO,
} from '../moverInvestimento';

const asset = (over: Record<string, unknown>) => ({
  id: 'a-1',
  symbol: 'X',
  name: 'X',
  type: 'stock',
  currency: 'BRL',
  source: 'brapi',
  ...over,
});

const posicao = (a: ReturnType<typeof asset>, over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  userId: 'user-1',
  assetId: a.id,
  quantity: 1,
  avgPrice: 1,
  totalInvested: 1,
  objetivo: 0,
  estrategia: null,
  tipoFii: null,
  regiaoEtf: null,
  categoriaOverride: null,
  tipoFundo: null,
  lastUpdate: new Date('2026-10-01T00:00:00Z'),
  planejamentoObjetivoId: null,
  vinculoAposentadoria: false,
  asset: a,
  ...over,
});

const fi = (over: Record<string, unknown> = {}) => ({
  id: 'fi-1',
  userId: 'user-1',
  assetId: 'a-cdb',
  type: 'CDB_PRE',
  description: 'CDB Banco X',
  startDate: new Date('2026-01-02T00:00:00Z'),
  maturityDate: new Date('2030-01-02T00:00:00Z'),
  investedAmount: 10_000,
  annualRate: 0,
  indexer: 'CDI',
  indexerPercent: 110,
  liquidityType: null,
  taxExempt: false,
  tesouroBondType: null,
  tesouroMaturity: null,
  asset: null,
  ...over,
});

const KNCA11 = asset({ id: 'a-knca', symbol: 'KNCA11', name: 'Kinea Agro', type: 'fii' });
const VALE3 = asset({ id: 'a-vale', symbol: 'VALE3', name: 'Vale', type: 'stock' });
const VOO = asset({ id: 'a-voo', symbol: 'VOO', name: 'Vanguard', type: 'etf', currency: 'USD' });
const FUNDO_FIA = asset({
  id: 'a-fia',
  symbol: 'FUNDO-12345678000199',
  name: 'Fundo Ações X',
  type: 'fia',
  source: 'cvm',
});
const CDB = asset({
  id: 'a-cdb',
  symbol: 'RENDA-FIXA-CDB-BANCO-X',
  name: 'CDB Banco X 110% CDI',
  type: 'bond',
  source: 'manual',
});
const PREV = asset({
  id: 'a-prev',
  symbol: 'PREVIDENCIA-PGBL-1',
  name: 'PGBL Banco X',
  type: 'previdencia',
  source: 'manual',
});

type Caso = {
  nome: string;
  row: ReturnType<typeof posicao>;
  fi?: ReturnType<typeof fi> | null;
};

const CASOS: Caso[] = [
  { nome: 'FII em Tijolo', row: posicao(KNCA11, { tipoFii: 'tijolo' }) },
  {
    nome: 'FII movido para Fundos',
    row: posicao(KNCA11, { categoriaOverride: 'fimFia', tipoFundo: 'fiagro' }),
  },
  { nome: 'ação', row: posicao(VALE3, { estrategia: 'value', objetivo: 5 }) },
  { nome: 'ETF em dólar', row: posicao(VOO) },
  { nome: 'fundo CVM', row: posicao(FUNDO_FIA) },
  { nome: 'CDB (trio)', row: posicao(CDB), fi: fi() },
  { nome: 'CDB liquidez diária', row: posicao(CDB), fi: fi({ liquidityType: 'diaria' }) },
  {
    nome: 'CDB movido para a Emergência',
    row: posicao(CDB, { categoriaOverride: 'reservaEmergencia' }),
    fi: fi(),
  },
  { nome: 'previdência', row: posicao(PREV) },
];

const preparar = (c: Caso) => {
  mockPrisma.portfolio.findFirst.mockResolvedValue(c.row);
  mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(c.fi ?? null);
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
  mockPricer.mockResolvedValue({ getCurrentValue: () => 11_500 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('obterOpcoesMover — payload idêntico (snapshot anterior à extração)', () => {
  for (const chave of ['true', 'false'] as const) {
    describe(`MOVER_CAIXA_RF_HABILITADO=${chave}`, () => {
      for (const c of CASOS) {
        it(c.nome, async () => {
          vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', chave);
          preparar(c);
          const r = await obterOpcoesMover('user-1', 'posicao', 'p-1');
          expect(r).toMatchSnapshot();
        });
      }
    });
  }
});

describe('resumoDestinos — miolo de obterOpcoesMover (sem I/O)', () => {
  for (const chave of ['true', 'false'] as const) {
    it(`concorda com obterOpcoesMover em todos os casos (chave ${chave})`, async () => {
      vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', chave);
      for (const c of CASOS) {
        preparar(c);
        const item = (await carregarItemMover('user-1', 'posicao', 'p-1'))!;
        const resumo = resumoDestinos(item);
        const opcoes = (await obterOpcoesMover('user-1', 'posicao', 'p-1'))!;
        expect(resumo.movivel, c.nome).toBe(opcoes.movivel);
        expect(resumo.motivo, c.nome).toBe(opcoes.motivo);
        expect(resumo.atual, c.nome).toEqual({
          categoria: opcoes.atual.categoria,
          base: estadoAtualDe(item).base,
          subgrupo: opcoes.atual.subgrupo,
          override: opcoes.atual.override,
        });
        expect(
          resumo.destinos.map((d) => [d.categoria, d.permitido, d.motivo]),
          c.nome,
        ).toEqual(opcoes.destinos.map((d) => [d.categoria, d.permitido, d.motivo]));
      }
    });
  }

  it('subgrupoEditavel/qtdSubgrupos independem da chave da fase 2', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    preparar(CASOS[0]);
    const r = resumoDestinos((await carregarItemMover('user-1', 'posicao', 'p-1'))!);
    expect(r.destinos.find((d) => d.categoria === 'fiis')).toMatchObject({
      permitido: true,
      subgrupoEditavel: true,
      qtdSubgrupos: 4,
    });
  });

  it('CDB com a chave ligada: trio com seções não editáveis; previdência sem destinos', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    preparar(CASOS.find((c) => c.nome === 'CDB (trio)')!);
    const cdb = resumoDestinos((await carregarItemMover('user-1', 'posicao', 'p-1'))!);
    expect(cdb.atual).toMatchObject({ categoria: 'rendaFixaFundos', base: 'rendaFixaFundos' });
    expect(cdb.destinos.filter((d) => d.permitido).map((d) => d.categoria)).toEqual([
      'reservaEmergencia',
      'reservaOportunidade',
      'rendaFixaFundos',
    ]);
    expect(cdb.destinos.find((d) => d.categoria === 'rendaFixaFundos')).toMatchObject({
      subgrupoEditavel: false,
      qtdSubgrupos: 3,
    });

    preparar(CASOS.find((c) => c.nome === 'previdência')!);
    const prev = resumoDestinos((await carregarItemMover('user-1', 'posicao', 'p-1'))!);
    expect(prev).toEqual({
      movivel: false,
      motivo: expect.any(String),
      atual: { categoria: 'previdenciaSeguros', base: null, subgrupo: null, override: false },
      destinos: [],
    });
  });
});

describe('planejarMover — as mesmas checagens do POST, sem gravar', () => {
  const carregar = async (c: Caso) => {
    preparar(c);
    const item = (await carregarItemMover('user-1', 'posicao', 'p-1'))!;
    return { item, atual: exigirEstadoMovivel(item) };
  };
  const FII = CASOS[0];

  it('troca de aba: destino, seção e trocouAba; nada é gravado', async () => {
    const { item, atual } = await carregar(FII);
    expect(planejarMover(item, atual, { categoria: 'fimFia', subgrupo: 'fiagro' })).toEqual({
      noop: false,
      destino: 'fimFia',
      subgrupo: 'fiagro',
      editavel: true,
      trocouAba: true,
    });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('mesma aba e seção → noop; só a seção → plano sem troca de aba', async () => {
    const { item, atual } = await carregar(FII);
    expect(planejarMover(item, atual, { categoria: 'fiis', subgrupo: 'tijolo' })).toEqual({
      noop: true,
    });
    expect(planejarMover(item, atual, { categoria: 'fiis', subgrupo: 'tvm' })).toMatchObject({
      noop: false,
      trocouAba: false,
      subgrupo: 'tvm',
    });
  });

  it('erros: destino bloqueado 409 com o motivo, sem seção 400, seção inválida 400', async () => {
    const { item, atual } = await carregar(FII);
    expect(() => planejarMover(item, atual, { categoria: 'stocks', subgrupo: 'value' })).toThrow(
      expect.objectContaining({ statusCode: 409, message: 'Em reais — esta aba é em dólar' }),
    );
    expect(() => planejarMover(item, atual, { categoria: 'acoes' })).toThrow(
      expect.objectContaining({ statusCode: 400, message: MSG_ESCOLHA_SECAO }),
    );
    expect(() => planejarMover(item, atual, { categoria: 'acoes', subgrupo: 'xx' })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('chave da fase 2 desligada e destino do trio → 409', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    const { item, atual } = await carregar(FII);
    expect(() => planejarMover(item, atual, { categoria: 'reservaEmergencia' })).toThrow(
      expect.objectContaining({ statusCode: 409, message: MSG_ABA_FORA_DA_FASE }),
    );
  });

  it('CDB para a Reserva: seção ignorada (null); exigirEstadoMovivel recusa previdência', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    const { item, atual } = await carregar(CASOS.find((c) => c.nome === 'CDB (trio)')!);
    expect(planejarMover(item, atual, { categoria: 'reservaEmergencia', subgrupo: 'x' })).toEqual({
      noop: false,
      destino: 'reservaEmergencia',
      subgrupo: null,
      editavel: false,
      trocouAba: true,
    });
    expect(planejarMover(item, atual, { categoria: 'rendaFixaFundos' })).toEqual({ noop: true });

    preparar(CASOS.find((c) => c.nome === 'previdência')!);
    const prev = (await carregarItemMover('user-1', 'posicao', 'p-1'))!;
    expect(() => exigirEstadoMovivel(prev)).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  it('moverInvestimento grava exatamente o plano', async () => {
    mockPrisma.portfolio.update.mockImplementation(async ({ data }) => ({
      ...posicao(KNCA11),
      ...data,
    }));
    preparar(FII);
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'fimFia',
      subgrupo: 'fiagro',
    });
    expect(r).toMatchObject({
      noop: false,
      destino: { categoria: 'fimFia', subgrupo: 'fiagro' },
      origem: { categoria: 'fiis', subgrupo: 'tijolo' },
    });
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: 'fimFia',
      tipoFundo: 'fiagro',
    });
  });
});
