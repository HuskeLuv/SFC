import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  dashboardData: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  economicIndex: { findMany: vi.fn() },
  tesouroDiretoPrice: { findMany: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/renda-fixa', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/renda-fixa', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/renda-fixa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([]);
  });

  describe('GET', () => {
    it('returns 401 without auth', async () => {
      const { requireAuthWithActing } = await import('@/utils/auth');
      vi.mocked(requireAuthWithActing).mockRejectedValueOnce(new Error('Não autorizado'));
      const res = await GET(createGetRequest());
      expect(res.status).toBe(401);
    });

    it('returns data with correct shape when no portfolio items', async () => {
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveProperty('resumo');
      expect(data).toHaveProperty('secoes');
      expect(data).toHaveProperty('totalGeral');
      expect(data.secoes).toEqual([]);
    });

    it('returns correct totalGeral shape', async () => {
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.totalGeral).toHaveProperty('valorAplicado');
      expect(data.totalGeral).toHaveProperty('valorAtualizado');
      expect(data.totalGeral).toHaveProperty('rentabilidade');
    });

    it('includes tesouro-direto in the asset.type filter', async () => {
      await GET(createGetRequest());
      expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            asset: expect.objectContaining({
              type: { in: ['bond', 'cash', 'tesouro-direto'] },
            }),
          }),
        }),
      );
    });

    it('uses Asset.currentPrice * quantity for catalog tesouro valuation', async () => {
      const tesouroAssetId = 'asset-td-1';
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'pf-1',
          assetId: tesouroAssetId,
          quantity: 10,
          avgPrice: 100, // cost basis — should NOT be used since currentPrice exists
          totalInvested: 1000,
          asset: {
            id: tesouroAssetId,
            type: 'tesouro-direto',
            name: 'Tesouro Selic 2029',
            currentPrice: { toNumber: () => 150 },
          },
        },
      ]);
      mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([
        {
          id: 'fi-1',
          assetId: tesouroAssetId,
          type: 'CDB_PRE',
          description: 'Tesouro Selic 2029',
          startDate: new Date('2024-01-01'),
          maturityDate: new Date('2029-03-01'),
          investedAmount: 1000,
          annualRate: 0,
          indexer: 'CDI',
          indexerPercent: 100,
          liquidityType: null,
          taxExempt: true,
          tesouroBondType: 'Tesouro Selic',
          tesouroMaturity: new Date('2029-03-01'),
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      // 150 * 10 = 1500 (currentPrice path), not 100 * 10 = 1000 (avgPrice path)
      expect(data.totalGeral.valorAtualizado).toBe(1500);
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 2000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
