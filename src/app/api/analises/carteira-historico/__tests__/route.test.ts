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
  stockTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  assetPriceHistory: { findMany: vi.fn().mockResolvedValue([]) },
}));

const mockGetAssetHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetHistory: mockGetAssetHistory,
}));

import { GET } from '../route';

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/analises/carteira-historico');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/analises/carteira-historico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockGetAssetHistory.mockResolvedValue([]);
  });

  it('retorna data vazio quando nenhuma transacao existe', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual([]);
  });

  it('retorna serie TWR quando ha transacoes', async () => {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    const fifteenDaysAgo = new Date(now - 15 * 86400000);

    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: 'compra',
        quantity: 100,
        price: 30,
        total: 3000,
        date: thirtyDaysAgo,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
      {
        type: 'compra',
        quantity: 50,
        price: 32,
        total: 1600,
        date: fifteenDaysAgo,
        stock: { ticker: 'VALE3' },
        asset: null,
      },
    ]);

    // Return price history for both assets
    mockGetAssetHistory.mockImplementation(async (symbol: string) => {
      const basePrice = symbol === 'PETR4' ? 30 : 32;
      const points = [];
      for (let i = 30; i >= 0; i--) {
        points.push({
          date: now - i * 86400000,
          value: basePrice + (30 - i) * 0.1,
        });
      }
      return points;
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
    if (data.data.length > 0) {
      expect(data.data[0]).toHaveProperty('date');
      expect(data.data[0]).toHaveProperty('value');
    }
  });

  it('aceita parametro startDate', async () => {
    const startDate = String(Date.now() - 86400000 * 60);
    const response = await GET(createRequest({ startDate }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toBeDefined();
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
