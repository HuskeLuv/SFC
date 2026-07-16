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

  it('imóvel/personalizado fica fora de saldoBruto E valorAplicado, mas entra na distribuição', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p-1',
        assetId: 'a-imovel',
        quantity: 1,
        avgPrice: 500000,
        totalInvested: 500000,
        asset: { symbol: 'PERSONALIZADO-1', type: 'personalizado', currency: 'BRL', name: 'Apto' },
      },
      {
        id: 'p-2',
        assetId: 'a-petr',
        quantity: 100,
        avgPrice: 25,
        totalInvested: 2500,
        asset: { symbol: 'PETR4', type: 'stock', currency: 'BRL', name: 'Petrobras' },
      },
    ]);
    vi.mocked(getAssetPrices).mockResolvedValue(new Map([['PETR4', 41.16]]));

    const response = await GET(createGetRequest('?includeHistorico=false'));
    const data = await response.json();
    expect(response.status).toBe(200);
    // Antes: valorAplicado=502500 e saldoBruto=4116 → rentabilidade -94%.
    expect(data.saldoBruto).toBeCloseTo(4116);
    expect(data.valorAplicado).toBeCloseTo(2500);
    expect(data.distribuicao.imoveisBens.valor).toBeCloseTo(500000);
    expect(data.distribuicao.acoes.valor).toBeCloseTo(4116);
    expect(data.rentabilidade).toBeCloseTo(((4116 - 2500) / 2500) * 100, 1);
  });

  it('BDR soma na categoria acoes (mesma categoria da aba Ações)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p-1',
        assetId: 'a-bdr',
        quantity: 10,
        avgPrice: 50,
        totalInvested: 500,
        asset: { symbol: 'K1EY34', type: 'bdr', currency: 'BRL', name: 'BDR Teste' },
      },
    ]);
    vi.mocked(getAssetPrices).mockResolvedValue(new Map([['K1EY34', 119.04]]));

    const response = await GET(createGetRequest('?includeHistorico=false'));
    const data = await response.json();
    expect(data.distribuicao.acoes.valor).toBeCloseTo(1190.4);
    expect(data.distribuicao.rendaFixaFundos.valor).toBe(0);
  });

  it('fundo com subtipo (multimercado/fia/fidc) soma em fimFia, não em rendaFixaFundos', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p-1',
        assetId: 'a-fundo',
        quantity: 1,
        avgPrice: 5000,
        totalInvested: 5000,
        asset: { symbol: 'CVM-123', type: 'multimercado', currency: 'BRL', name: 'FIM Teste' },
      },
    ]);
    vi.mocked(getAssetPrices).mockResolvedValue(new Map());

    const response = await GET(createGetRequest('?includeHistorico=false'));
    const data = await response.json();
    expect(data.distribuicao.fimFia.valor).toBeCloseTo(5000);
    expect(data.distribuicao.rendaFixaFundos.valor).toBe(0);
  });

  it('reserva editada vale o MESMO no saldoBruto e na distribuição (avgPrice-first)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p-1',
        assetId: 'a-res',
        quantity: 1,
        avgPrice: 8000,
        totalInvested: 10000,
        asset: { symbol: 'RESERVA-EMERG-1', type: 'emergency', currency: 'BRL', name: 'Reserva' },
      },
    ]);
    vi.mocked(getAssetPrices).mockResolvedValue(new Map());

    const response = await GET(createGetRequest('?includeHistorico=false'));
    const data = await response.json();
    // Antes: saldoBruto usava totalInvested (10000) e a distribuição avgPrice*qty (8000).
    expect(data.saldoBruto).toBeCloseTo(8000);
    expect(data.distribuicao.reservaEmergencia.valor).toBeCloseTo(8000);
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
