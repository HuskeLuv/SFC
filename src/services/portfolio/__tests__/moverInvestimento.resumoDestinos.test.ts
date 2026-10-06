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

import { obterOpcoesMover } from '../moverInvestimento';

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
