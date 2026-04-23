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
  portfolioProvento: { findMany: vi.fn().mockResolvedValue([]) },
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
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([]);
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

  it('inclui JCP cadastrado manualmente no total e no YoC', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 86400000);
    const jcpDate = new Date(now.getTime() - 10 * 86400000);

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

    // Sem dividendos da BRAPI — JCP é a única fonte de provento.
    mockGetDividends.mockResolvedValue([]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        id: 'pp-jcp-1',
        portfolioId: 'p1',
        userId: 'user-123',
        tipo: 'JCP',
        dataCom: jcpDate,
        dataPagamento: jcpDate,
        precificarPor: 'valor',
        valorTotal: 100, // bruto
        quantidadeBase: 100,
        impostoRenda: 15, // 15% IRRF
      },
    ]);

    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 35]]));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBe(1);
    expect(data.proventos[0].tipo).toBe('JCP');
    expect(data.proventos[0].valor).toBe(100);
    expect(data.kpis.rendaAcumulada.periodo).toBe(100);
    // YoC = 100 / 3000 (avgPrice * quantidade) = 3.33%
    expect(data.kpis.yoc.periodo).toBeCloseTo(3.33, 1);
    expect(data.kpis.yoc.ult12m).toBeCloseTo(3.33, 1);
  });

  it('soma JCP manual com dividendos BRAPI no YoC', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 86400000);
    const dividendDate = new Date(now.getTime() - 15 * 86400000);
    const jcpDate = new Date(now.getTime() - 5 * 86400000);

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
    mockGetDividends.mockResolvedValue([
      { date: dividendDate, tipo: 'Dividendo', valorUnitario: 0.5 }, // 100 * 0.5 = 50
    ]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        id: 'pp-jcp-1',
        portfolioId: 'p1',
        userId: 'user-123',
        tipo: 'JCP',
        dataCom: jcpDate,
        dataPagamento: jcpDate,
        precificarPor: 'valor',
        valorTotal: 80,
        quantidadeBase: 100,
        impostoRenda: 12,
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 35]]));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBe(2);
    expect(data.kpis.rendaAcumulada.periodo).toBe(130); // 50 + 80
    expect(data.kpis.yoc.periodo).toBeCloseTo(4.33, 1); // 130 / 3000
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
