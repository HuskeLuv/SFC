import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn().mockResolvedValue([]) },
  stockTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  cashflowGroup: { findMany: vi.fn().mockResolvedValue([]) },
  fixedIncomeAsset: { findMany: vi.fn().mockResolvedValue([]) },
  economicIndex: { findMany: vi.fn().mockResolvedValue([]) },
  portfolioRiscoRetornoCache: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  },
}));

const mockBuildPatrimonio = vi.hoisted(() => vi.fn());
const mockFiPricer = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ buildValueSeriesForAsset: vi.fn() }),
);
const mockComputeLiveTotals = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ saldoBruto: 0, valorAplicado: 0 }),
);
const mockGetAssetHistory = vi.hoisted(() => vi.fn());
const mockIsNonMarketSymbol = vi.hoisted(() => vi.fn().mockReturnValue(false));
const mockComputeBeta = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('@/services/portfolio/patrimonioHistoricoBuilder', () => ({
  buildPatrimonioHistorico: mockBuildPatrimonio,
  filterInvestmentsExclReservas: (xs: unknown[]) => xs,
}));
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: mockFiPricer,
}));
vi.mock('@/services/portfolio/portfolioLiveTotals', () => ({
  computePortfolioLiveTotals: mockComputeLiveTotals,
}));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetHistory: mockGetAssetHistory,
  isNonMarketSymbol: mockIsNonMarketSymbol,
}));
vi.mock('@/services/analises/sensibilidadeCarteira', async () => {
  const actual = await vi.importActual<typeof import('@/services/analises/sensibilidadeCarteira')>(
    '@/services/analises/sensibilidadeCarteira',
  );
  return {
    ...actual,
    computeBeta: mockComputeBeta,
  };
});

import { GET } from '../route';

const createRequest = () =>
  new NextRequest('http://localhost/api/analises/risco-retorno', { method: 'GET' });

/** Gera 90 fechamentos diários começando em P0 com retorno diário fixo. */
function buildDailyHistory(start: Date, days: number, dailyReturn: number, p0 = 100) {
  const out: Array<{ date: number; value: number }> = [];
  let price = p0;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push({ date: d.getTime(), value: price });
    price *= 1 + dailyReturn;
  }
  return out;
}

describe('GET /api/analises/risco-retorno — métricas por ativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockPrisma.portfolioRiscoRetornoCache.findUnique.mockResolvedValue(null);
    mockPrisma.portfolioRiscoRetornoCache.upsert.mockResolvedValue({});
    mockBuildPatrimonio.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [],
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });
  });

  it('inclui sharpe/vol/retornoAnual/retornoCDI por ativo na sensibilidade', async () => {
    const start = new Date('2024-01-01');
    // PETR4 sobe 0.1% ao dia consistentemente; IBOV sobe 0.05%.
    const petrHistory = buildDailyHistory(start, 90, 0.001);
    const ibovHistory = buildDailyHistory(start, 90, 0.0005);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
        lastUpdate: start,
        stockId: 'stock-1',
        assetId: null,
        stock: { id: 'stock-1', ticker: 'PETR4', companyName: 'Petrobras' },
        asset: null,
      },
    ]);

    mockGetAssetHistory.mockImplementation(async (symbol: string) => {
      if (symbol === '^BVSP') return ibovHistory;
      if (symbol === 'PETR4') return petrHistory;
      return [];
    });
    mockComputeBeta.mockReturnValue(2.0);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sensibilidade).toHaveLength(1);
    const petr = data.sensibilidade[0];
    expect(petr.ticker).toBe('PETR4');
    expect(petr.beta).toBe(2);
    // Com 90 dias de histórico, devemos ter retornoAnual/vol/sharpe/retornoCDI
    expect(petr.retornoAnual).toBeDefined();
    expect(petr.volatilidade).toBeDefined();
    expect(petr.sharpe).toBeDefined();
    expect(petr.retornoCDI).toBeDefined();
    // Vol de retorno 0.1%/dia constante deve ser muito baixa (próxima de 0)
    expect(petr.volatilidade).toBeLessThan(1);
    // Retorno anualizado positivo (subiu o período inteiro)
    expect(petr.retornoAnual).toBeGreaterThan(0);
  });

  it('omite métricas por ativo quando histórico insuficiente', async () => {
    const start = new Date('2024-01-01');
    const ibovHistory = buildDailyHistory(start, 90, 0.0005);
    // PETR4 com apenas 5 dias — abaixo do mínimo de 30
    const petrShort = buildDailyHistory(start, 5, 0.001);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
        lastUpdate: start,
        stockId: 'stock-1',
        assetId: null,
        stock: { id: 'stock-1', ticker: 'PETR4', companyName: 'Petrobras' },
        asset: null,
      },
    ]);

    mockGetAssetHistory.mockImplementation(async (symbol: string) => {
      if (symbol === '^BVSP') return ibovHistory;
      if (symbol === 'PETR4') return petrShort;
      return [];
    });
    mockComputeBeta.mockReturnValue(1.5);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(data.sensibilidade).toHaveLength(1);
    const petr = data.sensibilidade[0];
    expect(petr.beta).toBe(1.5);
    // Sem histórico suficiente para sharpe/vol/retorno
    expect(petr.sharpe).toBeUndefined();
    expect(petr.volatilidade).toBeUndefined();
    expect(petr.retornoAnual).toBeUndefined();
  });
});
