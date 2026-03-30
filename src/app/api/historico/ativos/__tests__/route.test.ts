import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  fixedIncomeAsset: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

const mockGetAssetPrices = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetPrices: mockGetAssetPrices }));
vi.mock('@/lib/carteiraCategoryColors', () => ({
  SECOES_ORDEM: ['Ações', 'FIIs', 'ETFs'],
}));
vi.mock('@/lib/portfolioCategoria', () => ({
  getCategoriaFromPortfolio: vi.fn().mockReturnValue('Ações'),
}));

import { GET } from '../route';

const createRequest = () =>
  new NextRequest('http://localhost/api/historico/ativos', { method: 'GET' });

describe('GET /api/historico/ativos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('retorna ativos agrupados por categoria', async () => {
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'port-1',
        userId: 'user-1',
        assetId: 'asset-1',
        stockId: null,
        quantity: 10,
        avgPrice: 50,
        totalInvested: 500,
        lastUpdate: new Date(),
        asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
        stock: null,
      },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 55]]));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.secoes).toBeDefined();
    expect(data.secoes[0].categoria).toBe('Ações');
    expect(data.secoes[0].ativos).toHaveLength(1);
    expect(data.secoes[0].ativos[0].symbol).toBe('PETR4');
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(
      Object.assign(new Error('Não autorizado'), { status: 401 }),
    );

    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it('retorna secoes vazia quando não há ativos', async () => {
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.secoes).toEqual([]);
  });
});
