import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';

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
    // Cache em memória persiste entre testes; limpar evita vazar resultados de
    // dividendos entre cenários (ex.: PETR4 mockado de formas diferentes).
    deleteTtlCacheKeyPrefix('dividendsBySymbol', '');
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

  it('isola falha por símbolo em getDividends (partial failure)', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 86400000);
    const dividendDate = new Date(now.getTime() - 10 * 86400000);

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
      {
        id: 'p2',
        userId: 'user-123',
        quantity: 50,
        totalInvested: 2500,
        avgPrice: 50,
        lastUpdate: lastMonth,
        stockId: 'stock-2',
        assetId: null,
        stock: { id: 'stock-2', ticker: 'VALE3', companyName: 'Vale' },
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
      {
        id: 'tx-2',
        userId: 'user-123',
        type: 'compra',
        quantity: 50,
        price: 50,
        total: 2500,
        date: lastMonth,
        stockId: 'stock-2',
        assetId: null,
        stock: { ticker: 'VALE3' },
        asset: null,
      },
    ]);

    mockGetAssetPrices.mockResolvedValue(
      new Map([
        ['PETR4', 35],
        ['VALE3', 55],
      ]),
    );

    // PETR4 falha (BRAPI 5xx); VALE3 retorna normalmente.
    mockGetDividends.mockImplementation(async (symbol: string) => {
      if (symbol === 'PETR4') {
        throw new Error('BRAPI 503 indisponivel');
      }
      return [{ date: dividendDate, tipo: 'dividendo', valorUnitario: 1.0 }];
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await GET(createRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      // VALE3 deve aparecer mesmo PETR4 tendo falhado
      expect(data.proventos.length).toBeGreaterThan(0);
      expect(data.proventos.some((p: { symbol: string }) => p.symbol === 'VALE3')).toBe(true);
      expect(data.proventos.some((p: { symbol: string }) => p.symbol === 'PETR4')).toBe(false);
      // Warn (não error) emitido para o símbolo que falhou
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[proventos] getDividends falhou para PETR4'),
        expect.any(Error),
      );
    } finally {
      warnSpy.mockRestore();
    }
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

  it('YoC e DY por ativo usam trailing-12m (ignora filtro de período)', async () => {
    const now = new Date();
    const oldDividend = new Date(now.getTime() - 500 * 86400000); // > 1 ano atrás
    const recentDividend = new Date(now.getTime() - 60 * 86400000); // dentro de 12m

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
        lastUpdate: new Date(now.getTime() - 600 * 86400000),
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
        price: 10,
        total: 1000,
        date: new Date(now.getTime() - 600 * 86400000),
        stockId: 'stock-1',
        assetId: null,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: oldDividend, tipo: 'Dividendo', valorUnitario: 5 }, // 100 * 5 = 500 (fora de 12m)
      { date: recentDividend, tipo: 'Dividendo', valorUnitario: 1 }, // 100 * 1 = 100 (dentro)
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 20]]));

    // Filtro "desde sempre" — inclui o dividendo antigo em data.total
    const startDate = new Date(now.getTime() - 1000 * 86400000).toISOString();
    const response = await GET(createRequest({ startDate, endDate: now.toISOString() }));
    const data = await response.json();

    const grouped = data.grouped.Petrobras;
    expect(grouped).toBeDefined();
    expect(grouped.total).toBe(600); // 500 + 100 no período filtrado
    // YoC/DY usam APENAS últimos 12m (apenas os 100)
    // YoC = 100 / 1000 (invested) = 10%
    expect(grouped.yoc).toBeCloseTo(10, 1);
    // DY = 100 / (20 * 100) = 100 / 2000 = 5%
    expect(grouped.dividendYield).toBeCloseTo(5, 1);
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('expoe yocLifetime, lifetimeProventos e ultimoProventoTotal por ativo', async () => {
    const now = new Date();
    const oldDividend = new Date(now.getTime() - 500 * 86400000);
    const recentDividend = new Date(now.getTime() - 60 * 86400000);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
        lastUpdate: new Date(now.getTime() - 600 * 86400000),
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
        price: 10,
        total: 1000,
        date: new Date(now.getTime() - 600 * 86400000),
        stockId: 'stock-1',
        assetId: null,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: oldDividend, tipo: 'Dividendo', valorUnitario: 5 }, // 500 (lifetime mas fora de 12m)
      { date: recentDividend, tipo: 'Dividendo', valorUnitario: 1 }, // 100 (12m e lifetime)
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 20]]));

    const startDate = new Date(now.getTime() - 1000 * 86400000).toISOString();
    const response = await GET(createRequest({ startDate, endDate: now.toISOString() }));
    const data = await response.json();

    const grouped = data.grouped.Petrobras;
    expect(grouped).toBeDefined();
    // yocLifetime considera todo o histórico, não só últimos 12m
    expect(grouped.yocLifetime).toBeCloseTo(60, 1); // 600 / 1000 * 100
    expect(grouped.lifetimeProventos).toBe(600);
    expect(grouped.ultimoProventoTotal).toBe(100); // última distribuição em $
    expect(grouped.proceedsPercentage).toBe(100); // único ativo

    expect(data.kpis.rendaAcumulada.lifetime).toBe(600);
    expect(data.kpis.yoc.lifetime).toBeCloseTo(60, 1);
  });

  it('expoe aReceber.nextMonth/next3Months/next12Months com top payer e lastDate', async () => {
    const now = new Date();
    const txDate = new Date(now.getTime() - 30 * 86400000);
    const in10d = new Date(now.getTime() + 10 * 86400000);
    const in60d = new Date(now.getTime() + 60 * 86400000);
    const in200d = new Date(now.getTime() + 200 * 86400000);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: txDate,
        stockId: 'stock-1',
        assetId: null,
        stock: { id: 'stock-1', ticker: 'PETR4', companyName: 'Petrobras' },
        asset: null,
      },
      {
        id: 'p2',
        userId: 'user-123',
        quantity: 50,
        totalInvested: 2000,
        avgPrice: 40,
        lastUpdate: txDate,
        stockId: 'stock-2',
        assetId: null,
        stock: { id: 'stock-2', ticker: 'ITUB4', companyName: 'Itau' },
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
        date: txDate,
        stockId: 'stock-1',
        assetId: null,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
      {
        id: 'tx-2',
        userId: 'user-123',
        type: 'compra',
        quantity: 50,
        price: 40,
        total: 2000,
        date: txDate,
        stockId: 'stock-2',
        assetId: null,
        stock: { ticker: 'ITUB4' },
        asset: null,
      },
    ]);
    // Futuros: PETR4 paga R$200 em 10d (no 1m); ITUB4 paga R$50 em 60d (no 3m mas fora de 1m);
    // PETR4 paga R$300 em 200d (só no 12m).
    mockGetDividends.mockImplementation(async (symbol: string) => {
      if (symbol === 'PETR4')
        return [
          { date: in10d, tipo: 'Dividendo', valorUnitario: 2 }, // 100 × 2 = 200
          { date: in200d, tipo: 'Dividendo', valorUnitario: 3 }, // 100 × 3 = 300
        ];
      if (symbol === 'ITUB4') return [{ date: in60d, tipo: 'Dividendo', valorUnitario: 1 }]; // 50 × 1 = 50
      return [];
    });
    mockGetAssetPrices.mockResolvedValue(
      new Map([
        ['PETR4', 35],
        ['ITUB4', 45],
      ]),
    );

    const response = await GET(createRequest());
    const data = await response.json();
    const aReceber = data.kpis.aReceber;

    expect(aReceber.futuro).toBe(550); // 200 + 50 + 300
    expect(aReceber.nextMonth.sum).toBe(200); // só PETR4 in10d
    expect(aReceber.nextMonth.topPayer.name).toBe('Petrobras');
    expect(aReceber.nextMonth.topPayer.value).toBe(200);
    expect(aReceber.next3Months.sum).toBe(250); // 200 + 50
    expect(aReceber.next3Months.topPayer.name).toBe('Petrobras');
    expect(aReceber.next3Months.topPayer.value).toBe(200);
    expect(aReceber.next12Months.sum).toBe(550);
    expect(aReceber.next12Months.topPayer.name).toBe('Petrobras');
    expect(aReceber.next12Months.topPayer.value).toBe(500); // 200 + 300
    expect(aReceber.nextMonth.lastDate).toBeTruthy();
    expect(aReceber.next12Months.lastDate).toBeTruthy();
  });

  it('proceedsPercentage soma 100% quando há mais de um ativo', async () => {
    const now = new Date();
    const txDate = new Date(now.getTime() - 30 * 86400000);
    const dividendDate = new Date(now.getTime() - 10 * 86400000);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: txDate,
        stockId: 'stock-1',
        assetId: null,
        stock: { id: 'stock-1', ticker: 'PETR4', companyName: 'Petrobras' },
        asset: null,
      },
      {
        id: 'p2',
        userId: 'user-123',
        quantity: 50,
        totalInvested: 2000,
        avgPrice: 40,
        lastUpdate: txDate,
        stockId: 'stock-2',
        assetId: null,
        stock: { id: 'stock-2', ticker: 'ITUB4', companyName: 'Itau' },
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
        date: txDate,
        stockId: 'stock-1',
        assetId: null,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
      {
        id: 'tx-2',
        userId: 'user-123',
        type: 'compra',
        quantity: 50,
        price: 40,
        total: 2000,
        date: txDate,
        stockId: 'stock-2',
        assetId: null,
        stock: { ticker: 'ITUB4' },
        asset: null,
      },
    ]);
    // PETR4: 100 cotas × 0.75 = 75; ITUB4: 50 cotas × 0.5 = 25 → total 100
    mockGetDividends.mockImplementation(async (symbol: string) => {
      if (symbol === 'PETR4')
        return [{ date: dividendDate, tipo: 'Dividendo', valorUnitario: 0.75 }];
      if (symbol === 'ITUB4')
        return [{ date: dividendDate, tipo: 'Dividendo', valorUnitario: 0.5 }];
      return [];
    });
    mockGetAssetPrices.mockResolvedValue(
      new Map([
        ['PETR4', 35],
        ['ITUB4', 45],
      ]),
    );

    const response = await GET(createRequest());
    const data = await response.json();

    expect(data.kpis.rendaAcumulada.periodo).toBe(100);
    const sum =
      (data.grouped.Petrobras?.proceedsPercentage ?? 0) +
      (data.grouped.Itau?.proceedsPercentage ?? 0);
    expect(sum).toBeCloseTo(100, 1);
    expect(data.grouped.Petrobras?.proceedsPercentage).toBeCloseTo(75, 1);
    expect(data.grouped.Itau?.proceedsPercentage).toBeCloseTo(25, 1);
  });
});
