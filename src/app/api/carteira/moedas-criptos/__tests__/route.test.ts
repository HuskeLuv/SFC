import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
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

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/services/market/marketIndicatorService', () => ({
  getIndicator: vi.fn().mockResolvedValue({ price: 5.0 }),
}));

import { GET, POST } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/moedas-criptos', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/moedas-criptos', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/moedas-criptos', () => {
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
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data.totalGeral.valorAplicado).toBe(0);
    });

    it('returns sections with crypto portfolio data', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 0.5,
          totalInvested: 15000,
          avgPrice: 30000,
          objetivo: 5,
          assetId: 'a1',
          stockId: null,
          stock: null,
          asset: { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.secoes.length).toBeGreaterThan(0);
      const allAtivos = data.secoes.flatMap((s: { ativos: { ticker: string }[] }) => s.ativos);
      expect(allAtivos.some((a: { ticker: string }) => a.ticker === 'BTC')).toBe(true);
    });

    it('converts USD non-crypto values to BRL (payload é 100% BRL)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p2',
          userId: 'user-1',
          quantity: 10,
          totalInvested: 1000,
          avgPrice: 100,
          objetivo: 0,
          assetId: 'a2',
          stockId: null,
          stock: null,
          asset: { symbol: 'XAU', name: 'Ouro', type: 'metal', currency: 'USD' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      const ativo = data.secoes
        .flatMap((s: { ativos: { ticker: string }[] }) => s.ativos)
        .find((a: { ticker: string }) => a.ticker === 'XAU') as {
        precoAquisicao: number;
        valorAtualizado: number;
        valorTotal: number;
      };
      // dólar mockado em 5.0: avgPrice 100 USD → R$ 500; 10 un × 500 = R$ 5.000
      expect(ativo.precoAquisicao).toBe(500);
      expect(ativo.valorAtualizado).toBe(5000);
      expect(ativo.valorTotal).toBe(5000);
    });

    it('does not convert crypto values (já são BRL por convenção)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 0.5,
          totalInvested: 15000,
          avgPrice: 30000,
          objetivo: 0,
          assetId: 'a1',
          stockId: null,
          stock: null,
          asset: { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      const ativo = data.secoes
        .flatMap((s: { ativos: { ticker: string }[] }) => s.ativos)
        .find((a: { ticker: string }) => a.ticker === 'BTC') as {
        precoAquisicao: number;
        valorAtualizado: number;
      };
      // currency 'USD' em cripto é metadado de catálogo; preços já em BRL
      expect(ativo.precoAquisicao).toBe(30000);
      expect(ativo.valorAtualizado).toBe(15000);
    });

    it('totalGeral reflects computed risco/quantoFalta instead of hardcoded 0', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 0.5,
          totalInvested: 15000,
          avgPrice: 30000,
          objetivo: 5,
          assetId: 'a1',
          stockId: null,
          stock: null,
          asset: { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      // Ativo único: riscoPorAtivo = percentualCarteira = 100
      expect(data.totalGeral.risco).toBe(100);
      // objetivo 5 − percentual 100 = −95
      expect(data.totalGeral.quantoFalta).toBe(-95);
      expect(data.totalGeral.necessidadeAporte).toBe(0);
      // Consistente com a soma das seções
      const totalRiscoSecoes = data.secoes.reduce(
        (s: number, sec: { totalRisco: number }) => s + sec.totalRisco,
        0,
      );
      expect(data.totalGeral.risco).toBe(totalRiscoSecoes);
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 5000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
