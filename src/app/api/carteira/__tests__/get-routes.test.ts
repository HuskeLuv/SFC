import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  dashboardData: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  asset: { findMany: vi.fn(), findUnique: vi.fn() },
  assetPriceHistory: { findMany: vi.fn() },
  cashflowGroup: { findMany: vi.fn() },
  marketIndicatorCache: { findUnique: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

const mockGetAssetPrices = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
const mockGetAssetHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockLogSensitiveEndpointAccess = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/services/assetPriceService', () => ({
  getAssetPrices: mockGetAssetPrices,
  getAssetHistory: mockGetAssetHistory,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitiveEndpointAccess,
}));

vi.mock('@/services/marketIndicatorService', () => ({
  getIndicator: vi.fn().mockResolvedValue(null),
}));

const mockUser = { id: 'user-123', email: 'test@test.com', name: 'Test' };

const createGetRequest = (url: string, searchParams?: Record<string, string>) => {
  const urlObj = new URL(url);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => urlObj.searchParams.set(k, v));
  }
  return new NextRequest(urlObj.toString());
};

const setupCommonMocks = () => {
  mockPrisma.user.findUnique.mockResolvedValue(mockUser);
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
  mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
  mockPrisma.dashboardData.findMany.mockResolvedValue([]);
  mockPrisma.dashboardData.update.mockResolvedValue({});
  mockPrisma.dashboardData.create.mockResolvedValue({});
  mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
  mockPrisma.asset.findUnique.mockResolvedValue(null);
  mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);
  mockGetAssetPrices.mockResolvedValue(new Map());
  mockGetAssetHistory.mockResolvedValue([]);
};

describe('GET /api/carteira - Rotas de exibição das tabelas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    setupCommonMocks();
  });

  describe('GET /api/carteira/reserva-emergencia', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../reserva-emergencia/route');
      const response = await GET(
        createGetRequest('http://localhost/api/carteira/reserva-emergencia'),
      );
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('ativos');
      expect(Array.isArray(data.ativos)).toBe(true);
      expect(data).toHaveProperty('saldoInicioMes');
      expect(data).toHaveProperty('rendimento');
      expect(data).toHaveProperty('rentabilidade');
    });

    it('retorna 404 quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const { GET } = await import('../reserva-emergencia/route');
      const response = await GET(
        createGetRequest('http://localhost/api/carteira/reserva-emergencia'),
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain('Usuário');
    });
  });

  describe('GET /api/carteira/reserva-oportunidade', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../reserva-oportunidade/route');
      const response = await GET(
        createGetRequest('http://localhost/api/carteira/reserva-oportunidade'),
      );
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('ativos');
      expect(Array.isArray(data.ativos)).toBe(true);
      expect(data).toHaveProperty('saldoInicioMes');
      expect(data).toHaveProperty('rendimento');
      expect(data).toHaveProperty('rentabilidade');
    });
  });

  describe('GET /api/carteira/renda-fixa', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../renda-fixa/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/renda-fixa'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
    });
  });

  describe('GET /api/carteira/fim-fia', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../fim-fia/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/fim-fia'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
    });
  });

  describe('GET /api/carteira/acoes', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../acoes/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/acoes'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
      expect(data.resumo ?? data).toHaveProperty('caixaParaInvestir');
    });
  });

  describe('GET /api/carteira/fii', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../fii/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/fii'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
      expect(data.resumo ?? data).toHaveProperty('caixaParaInvestir');
    });
  });

  describe('GET /api/carteira/stocks', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../stocks/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/stocks'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
      expect(data.resumo ?? data).toHaveProperty('caixaParaInvestir');
    });
  });

  describe('GET /api/carteira/reit', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../reit/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/reit'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
      expect(data).toHaveProperty('resumo');
    });
  });

  describe('GET /api/carteira/etf', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../etf/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/etf'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
      expect(data.resumo ?? data).toHaveProperty('caixaParaInvestir');
    });
  });

  describe('GET /api/carteira/moedas-criptos', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../moedas-criptos/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/moedas-criptos'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('secoes');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data).toHaveProperty('totalGeral');
      expect(data.resumo ?? data).toHaveProperty('caixaParaInvestir');
    });
  });

  describe('GET /api/carteira/previdencia-seguros', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../previdencia-seguros/route');
      const response = await GET(
        createGetRequest('http://localhost/api/carteira/previdencia-seguros'),
      );
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('resumo');
      expect(data).toHaveProperty('secoes');
      expect(data).toHaveProperty('totalGeral');
    });
  });

  describe('GET /api/carteira/opcoes', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../opcoes/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/opcoes'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('resumo');
      expect(data).toHaveProperty('secoes');
      expect(data).toHaveProperty('totalGeral');
    });
  });

  describe('GET /api/carteira/imoveis-bens', () => {
    it('retorna 200 com estrutura esperada', async () => {
      const { GET } = await import('../imoveis-bens/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/imoveis-bens'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('ativos');
      expect(Array.isArray(data.ativos)).toBe(true);
      expect(data).toHaveProperty('resumo');
    });
  });

  describe('GET /api/carteira/resumo', () => {
    it('retorna 200 com estrutura esperada', async () => {
      mockPrisma.assetPriceHistory.findMany = vi.fn().mockResolvedValue([]);
      const { GET } = await import('../resumo/route');
      const response = await GET(createGetRequest('http://localhost/api/carteira/resumo'));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('distribuicao');
      expect(data).toHaveProperty('historicoPatrimonio');
      expect(data).toHaveProperty('saldoBruto');
    });
  });
});
