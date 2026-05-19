import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  dashboardData: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));

import { GET, POST } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/fii', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/fii', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/fii', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
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
      expect(data.totalGeral.valorAplicado).toBe(0);
    });

    it('returns sections with FII portfolio data', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 10,
          totalInvested: 1000,
          avgPrice: 100,
          objetivo: 15,
          tipoFii: 'tijolo',
          stockId: 's1',
          asset: { symbol: 'HGLG11', name: 'CGHG Logística', type: 'fii' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.secoes.length).toBeGreaterThan(0);
      expect(data.secoes[0].ativos[0].ticker).toBe('HGLG11');
    });

    it('phase C: filtro SQL usa asset.type=fii (não faz over-fetch)', async () => {
      await GET(createGetRequest());
      expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            asset: { type: 'fii' },
          }),
        }),
      );
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 500 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // ─── Regressão dos bugs do relatório Maio/2026 ───
  describe('Bug #06 — float exposto no donut', () => {
    it('arredonda valor da alocação para 2 casas (200 × 156,05 deveria ser 31210, não 31210.000000000004)', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(new Map([['HGLG11', 156.05]]));
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 200,
          totalInvested: 30000,
          avgPrice: 150,
          objetivo: 100,
          tipoFii: 'tijolo',
          stockId: 's1',
          asset: { symbol: 'HGLG11', name: 'CSHG Logística', type: 'fii' },
          lastUpdate: new Date(),
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();

      expect(res.status).toBe(200);
      // valor cru de 200*156.05 daria 31210.000000000004 — round2 → 31210
      expect(data.alocacaoSegmento[0].valor).toBe(31210);
      expect(data.alocacaoAtivo[0].valor).toBe(31210);
      expect(String(data.alocacaoSegmento[0].valor)).not.toMatch(/0000000\d+$/);
      expect(String(data.alocacaoAtivo[0].valor)).not.toMatch(/0000000\d+$/);
    });
  });

  describe('Bug #14 — soma dos % de alocação fecha 100', () => {
    it('alocacaoSegmento.percentual soma 100 com FIIs em segmentos distintos', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(
        new Map([
          ['HGLG11', 150],
          ['KFOF11', 50],
        ]),
      );
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 100,
          totalInvested: 10000,
          avgPrice: 100,
          objetivo: 50,
          tipoFii: 'tijolo',
          stockId: 's1',
          asset: { symbol: 'HGLG11', name: 'CSHG', type: 'fii' },
          lastUpdate: new Date(),
        },
        {
          id: 'p2',
          userId: 'user-1',
          quantity: 100,
          totalInvested: 10000,
          avgPrice: 100,
          objetivo: 50,
          tipoFii: 'fofi',
          stockId: 's2',
          asset: { symbol: 'KFOF11', name: 'Kinea FOF', type: 'fii' },
          lastUpdate: new Date(),
        },
      ]);

      const res = await GET(createGetRequest());
      const data = await res.json();

      const sum = data.alocacaoSegmento.reduce(
        (acc: number, item: { percentual: number }) => acc + item.percentual,
        0,
      );
      expect(sum).toBeCloseTo(100, 1);
    });

    it('alocacaoAtivo.percentual soma 100 com FIIs no mesmo segmento', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(
        new Map([
          ['HGLG11', 200],
          ['MXRF11', 100],
          ['XPLG11', 100],
        ]),
      );
      mockPrisma.portfolio.findMany.mockResolvedValue(
        ['HGLG11', 'MXRF11', 'XPLG11'].map((ticker, i) => ({
          id: `p${i}`,
          userId: 'user-1',
          quantity: 100,
          totalInvested: 10000,
          avgPrice: 100,
          objetivo: 33.33,
          tipoFii: 'tijolo',
          assetId: `asset-${i}`,
          asset: { symbol: ticker, name: ticker, type: 'fii' },
          lastUpdate: new Date(),
        })),
      );

      const res = await GET(createGetRequest());
      const data = await res.json();

      const sum = data.alocacaoAtivo.reduce(
        (acc: number, item: { percentual: number }) => acc + item.percentual,
        0,
      );
      expect(sum).toBeCloseTo(100, 1);
      for (const item of data.alocacaoAtivo) {
        expect(String(item.percentual)).not.toMatch(/0000000\d+$/);
      }
    });

    // 2º passe (2026-05-19): toBeCloseTo(100, 1) tolerava 99.95–100.05.
    // Caso clássico: 3 FIIs com valores iguais geram 33.33+33.33+33.33 = 99.99.
    // Donut/Kinvo precisam de exatamente 100,00 — usuário vê inconsistência.
    it('alocacaoSegmento.percentual fecha EXATAMENTE 100,00 (largest-remainder)', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(
        new Map([
          ['HGLG11', 100],
          ['MXRF11', 100],
          ['XPLG11', 100],
        ]),
      );
      mockPrisma.portfolio.findMany.mockResolvedValue(
        [
          { ticker: 'HGLG11', tipo: 'tijolo' },
          { ticker: 'MXRF11', tipo: 'papel' },
          { ticker: 'XPLG11', tipo: 'logistica' },
        ].map((cfg, i) => ({
          id: `p${i}`,
          userId: 'user-1',
          quantity: 100,
          totalInvested: 10000,
          avgPrice: 100,
          objetivo: 33.33,
          tipoFii: cfg.tipo,
          assetId: `asset-${i}`,
          asset: { symbol: cfg.ticker, name: cfg.ticker, type: 'fii' },
          lastUpdate: new Date(),
        })),
      );

      const res = await GET(createGetRequest());
      const data = await res.json();

      const sum = data.alocacaoSegmento.reduce(
        (acc: number, item: { percentual: number }) => acc + item.percentual,
        0,
      );
      // Tolerância eps 0.001 — não 0.05 como o teste mais lasso acima.
      expect(Math.abs(sum - 100)).toBeLessThan(0.001);
    });

    it('alocacaoAtivo.percentual fecha EXATAMENTE 100,00 (largest-remainder)', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(
        new Map([
          ['HGLG11', 100],
          ['MXRF11', 100],
          ['XPLG11', 100],
        ]),
      );
      mockPrisma.portfolio.findMany.mockResolvedValue(
        ['HGLG11', 'MXRF11', 'XPLG11'].map((ticker, i) => ({
          id: `p${i}`,
          userId: 'user-1',
          quantity: 100,
          totalInvested: 10000,
          avgPrice: 100,
          objetivo: 33.33,
          tipoFii: 'tijolo',
          assetId: `asset-${i}`,
          asset: { symbol: ticker, name: ticker, type: 'fii' },
          lastUpdate: new Date(),
        })),
      );

      const res = await GET(createGetRequest());
      const data = await res.json();

      const sum = data.alocacaoAtivo.reduce(
        (acc: number, item: { percentual: number }) => acc + item.percentual,
        0,
      );
      expect(Math.abs(sum - 100)).toBeLessThan(0.001);
    });
  });
});
