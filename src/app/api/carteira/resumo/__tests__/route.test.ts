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
  loadHistoricoFromSnapshots: vi.fn().mockResolvedValue(null),
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

const createGetRequest = (params = '') =>
  new NextRequest(`http://localhost/api/carteira/resumo${params}`, {
    method: 'GET',
  });

describe('GET /api/carteira/resumo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Test User' });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.alocacaoConfig.findMany.mockResolvedValue([]);
    mockPrisma.asset.findMany.mockResolvedValue([]);
  });

  it('retorna resumo da carteira com sucesso', async () => {
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    // The response should contain portfolio summary data
    expect(data).toBeDefined();
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna 404 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });
});
