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
  new NextRequest('http://localhost/api/carteira/acoes', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/acoes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/acoes', () => {
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

    it('returns sections with portfolio data', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 10,
          totalInvested: 500,
          avgPrice: 50,
          objetivo: 20,
          estrategia: 'value',
          stockId: 's1',
          stock: { ticker: 'PETR4', companyName: 'Petrobras', sector: 'energia', subsector: '' },
          asset: null,
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.secoes.length).toBeGreaterThan(0);
      expect(data.secoes[0].ativos[0].ticker).toBe('PETR4');
    });

    it('regression (phase C): BDR armazenado via assetId aparece na tabela de ações', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p-bdr',
          userId: 'user-1',
          quantity: 5,
          totalInvested: 250,
          avgPrice: 50,
          objetivo: 10,
          estrategia: 'growth',
          stockId: null,
          stock: null,
          assetId: 'a-bdr',
          asset: { symbol: 'AAPL34', name: 'Apple BDR', type: 'bdr', currency: 'BRL' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);

      const allAtivos = data.secoes.flatMap(
        (s: { ativos: Array<{ ticker: string; nome: string }> }) => s.ativos,
      );
      expect(allAtivos).toHaveLength(1);
      expect(allAtivos[0].ticker).toBe('AAPL34');
      expect(allAtivos[0].nome).toBe('Apple BDR');

      expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { stockId: { not: null } },
              { asset: { type: { in: ['bdr', 'brd'] } } },
            ]),
          }),
        }),
      );
    });

    it('não inclui FIIs (ticker terminando em 11) na tabela de ações', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p-fii',
          userId: 'user-1',
          quantity: 20,
          totalInvested: 2000,
          avgPrice: 100,
          objetivo: 15,
          estrategia: 'value',
          stockId: 's-fii',
          stock: { ticker: 'KNRI11', companyName: 'Kinea', sector: null, subsector: null },
          asset: null,
          lastUpdate: new Date(),
        },
        {
          id: 'p-acao',
          userId: 'user-1',
          quantity: 30,
          totalInvested: 900,
          avgPrice: 30,
          objetivo: 15,
          estrategia: 'value',
          stockId: 's-acao',
          stock: { ticker: 'VALE3', companyName: 'Vale', sector: 'materiais', subsector: '' },
          asset: null,
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);

      const tickers = data.secoes.flatMap((s: { ativos: Array<{ ticker: string }> }) =>
        s.ativos.map((a) => a.ticker),
      );
      expect(tickers).toContain('VALE3');
      expect(tickers).not.toContain('KNRI11');
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 1000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.dashboardData.create).toHaveBeenCalled();
    });
  });
});
