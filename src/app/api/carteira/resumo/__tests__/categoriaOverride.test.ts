/**
 * Mover na Carteira (out/2026): o override de aba muda a CATEGORIA na
 * distribuição (pizza, Alocação, Necessidade de Aporte) sem mudar o saldo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  cashflowGroup: { findMany: vi.fn() },
  dashboardData: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  alocacaoConfig: { findMany: vi.fn() },
  asset: { findMany: vi.fn() },
  economicIndex: { findMany: vi.fn().mockResolvedValue([]) },
  tesouroDiretoPrice: { findMany: vi.fn().mockResolvedValue([]) },
  divida: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/services/market/marketIndicatorService', () => ({
  getIndicator: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/simpleTtlCache', () => ({
  getTtlCache: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
  deleteTtlCacheKeyPrefix: vi.fn(),
}));

vi.mock('@/services/portfolio/portfolioSeriesAggregation', () => ({
  applyChartAggregation: vi.fn().mockReturnValue([]),
}));

vi.mock('@/services/portfolio/portfolioSnapshotReader', () => ({
  loadHistoricoFromSnapshots: vi.fn().mockResolvedValue({
    historicoPatrimonio: [],
    historicoTWR: [],
    historicoTWRPeriodo: [],
    coverageOk: false,
    coverageReason: 'no-rows',
  }),
}));

vi.mock('@/services/portfolio/portfolioSnapshotPersistence', () => ({
  triggerLazyBackfill: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/portfolio/patrimonioHistoricoBuilder', () => ({
  buildDailyTimeline: vi.fn().mockReturnValue([]),
  buildDailyPriceMap: vi.fn().mockReturnValue(new Map()),
  buildPatrimonioHistorico: vi.fn().mockReturnValue([]),
  calculateFixedIncomeValue: vi.fn().mockReturnValue(0),
  filterInvestmentsExclReservas: vi.fn().mockReturnValue([]),
  getRawPatrimonioTimelineStart: vi.fn().mockReturnValue(new Date()),
  normalizeDateStart: vi.fn().mockReturnValue(new Date()),
}));

import { GET } from '../route';
import { getAssetPrices } from '@/services/pricing/assetPriceService';

const createGetRequest = (params = '') =>
  new NextRequest(`http://localhost/api/carteira/resumo${params}`, {
    method: 'GET',
  });

type Linha = {
  id: string;
  assetId: string;
  quantity: number;
  avgPrice: number;
  totalInvested: number;
  categoriaOverride: string | null;
  asset: { symbol: string; type: string; currency: string; name: string };
};

const linha = (
  symbol: string,
  type: string,
  categoriaOverride: string | null,
  quantity = 10,
  avgPrice = 100,
): Linha => ({
  id: `p-${symbol}`,
  assetId: `a-${symbol}`,
  quantity,
  avgPrice,
  totalInvested: quantity * avgPrice,
  categoriaOverride,
  asset: { symbol, type, currency: 'BRL', name: symbol },
});

const resumo = async (portfolio: Linha[]) => {
  mockPrisma.portfolio.findMany.mockResolvedValue(portfolio);
  const res = await GET(createGetRequest('?includeHistorico=false'));
  expect(res.status).toBe(200);
  return res.json();
};

describe('GET /api/carteira/resumo — categoriaOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Test User' });
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.alocacaoConfig.findMany.mockResolvedValue([]);
    mockPrisma.asset.findMany.mockResolvedValue([]);
    mockPrisma.divida.findMany.mockResolvedValue([]);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    vi.mocked(getAssetPrices).mockResolvedValue(
      new Map([
        ['HGLG11', 160],
        ['KNRI11', 140],
        ['BOVA11', 120],
      ]),
    );
  });

  it('FII movido para Fundos soma em fimFia e o saldo bruto não muda', async () => {
    const semMover = await resumo([linha('HGLG11', 'fii', null), linha('KNRI11', 'fii', null)]);
    const movido = await resumo([linha('HGLG11', 'fii', 'fimFia'), linha('KNRI11', 'fii', null)]);

    expect(semMover.distribuicao.fiis.valor).toBeCloseTo(3000);
    expect(semMover.distribuicao.fimFia.valor).toBe(0);

    expect(movido.distribuicao.fimFia.valor).toBeCloseTo(1600);
    expect(movido.distribuicao.fiis.valor).toBeCloseTo(1400);
    expect(movido.saldoBruto).toBeCloseTo(semMover.saldoBruto);
    expect(movido.valorAplicado).toBeCloseTo(semMover.valorAplicado);
  });

  it('ETF movido para Ações soma em acoes', async () => {
    const data = await resumo([linha('BOVA11', 'etf', 'acoes')]);
    expect(data.distribuicao.acoes.valor).toBeCloseTo(1200);
    expect(data.distribuicao.etfs.valor).toBe(0);
  });

  it('override igual à aba base ou em item de aba fixa não muda nada', async () => {
    const data = await resumo([
      linha('KNRI11', 'fii', 'fiis'),
      linha('CDB-XPTO', 'bond', 'acoes', 1, 1000),
    ]);
    expect(data.distribuicao.fiis.valor).toBeCloseTo(1400);
    expect(data.distribuicao.rendaFixaFundos.valor).toBeCloseTo(1000);
    expect(data.distribuicao.acoes.valor).toBe(0);
  });
});
