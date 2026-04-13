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
}));

const mockGetAssetPrices = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
const mockGetDividends = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockGetCorporateActions = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockLogSensitiveEndpointAccess = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: mockGetAssetPrices,
}));

vi.mock('@/services/pricing/dividendService', () => ({
  getDividends: mockGetDividends,
  getCorporateActions: mockGetCorporateActions,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitiveEndpointAccess,
}));

import { GET } from '../route';

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/analises/proventos');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/analises/proventos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockGetAssetPrices.mockResolvedValue(new Map());
    mockGetDividends.mockResolvedValue([]);
  });

  it('retorna resposta vazia quando portfolio vazio', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos).toEqual([]);
    expect(data.grouped).toEqual({});
    expect(data.total).toBe(0);
    expect(data.media).toBe(0);
  });

  it('retorna proventos agrupados por ativo', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 86400000);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: lastMonth,
        stockId: 'stock-1',
        assetId: null,
        stock: { id: 'stock-1', ticker: 'PETR4', companyName: 'Petrobras' },
        asset: null,
      },
    ]);

    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-123',
        type: 'compra',
        quantity: 100,
        price: 30,
        total: 3000,
        date: lastMonth,
        stockId: 'stock-1',
        assetId: null,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
    ]);

    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 35]]));

    const dividendDate = new Date(now.getTime() - 10 * 86400000);
    mockGetDividends.mockResolvedValue([
      {
        date: dividendDate,
        tipo: 'dividendo',
        valorUnitario: 0.5,
      },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBeGreaterThan(0);
    expect(data.total).toBeGreaterThan(0);
    expect(data.grouped).toBeDefined();
    expect(data.monthly).toBeDefined();
    expect(data.yearly).toBeDefined();
  });

  it('aceita parametros startDate e endDate', async () => {
    const startDate = new Date('2025-01-01').toISOString();
    const endDate = new Date('2025-12-31').toISOString();

    const response = await GET(createRequest({ startDate, endDate }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos).toBeDefined();
  });

  it('aceita parametro groupBy', async () => {
    const response = await GET(createRequest({ groupBy: 'classe' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.grouped).toBeDefined();
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
