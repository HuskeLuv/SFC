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
  assetCorporateAction: { findMany: vi.fn().mockResolvedValue([]) },
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
  // Exports usados pela rota pro fallback de JCP (Lacuna 1/3 do 2º passe).
  // Mantemos a lógica real porque os testes verificam o comportamento de
  // dedup e dedução IRRF — não faz sentido mockar.
  isJcpType: (tipo: string | null | undefined) =>
    !!tipo && /JCP|JSCP|JRC|JURO SOBRE CAPITAL|JUROS SOBRE CAPITAL|JUROS S\/ CAPITAL/i.test(tipo),
  getJcpIrrfRate: (paymentDate: Date) =>
    paymentDate.getTime() >= Date.UTC(2026, 0, 1) ? 0.175 : 0.15,
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { id: 'asset-2', symbol: 'VALE3', name: 'Vale', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { symbol: 'VALE3', name: 'VALE3', type: 'stock' },
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
    // Bug #01 (2º passe): valor exibido é LÍQUIDO (valorTotal - impostoRenda).
    // Antes este teste verificava o bruto e mascarava o bug — IRRF retido
    // (R$ 15) inflava o total recebido em R$ 15.
    expect(data.proventos[0].valor).toBe(85);
    expect(data.kpis.rendaAcumulada.periodo).toBe(85);
    // YoC = 85 / 3000 (avgPrice * quantidade) = 2.83%
    expect(data.kpis.yoc.periodo).toBeCloseTo(2.83, 1);
    expect(data.kpis.yoc.ult12m).toBeCloseTo(2.83, 1);
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
    // Bug #01 (2º passe): JCP=80 bruto - 12 IRRF = 68 líquido. Total = 50 + 68 = 118.
    expect(data.kpis.rendaAcumulada.periodo).toBe(118);
    expect(data.kpis.yoc.periodo).toBeCloseTo(3.93, 1); // 118 / 3000
  });

  it('aplica valorUnitarioLiquido (JCP BRAPI) no total e no YoC', async () => {
    // Bug #01 (2º passe): quando dividendService retorna `valorUnitarioLiquido`
    // diferente de `valorUnitario` (JCP com 15% IRRF), a rota usa o líquido.
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
        asset: { id: 'asset-1', symbol: 'ITUB4', name: 'Itaú', type: 'stock' },
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
        asset: { symbol: 'ITUB4', name: 'Itaú', type: 'stock' },
      },
    ]);
    // JCP do BRAPI: bruto 1.0/cota, líquido 0.85/cota (15% IRRF aplicado pelo service)
    mockGetDividends.mockResolvedValue([
      {
        date: jcpDate,
        tipo: 'JCP',
        valorUnitario: 1.0,
        valorUnitarioLiquido: 0.85,
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['ITUB4', 35]]));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBe(1);
    // Valor = 100 cotas × 0.85 líquido = 85
    expect(data.proventos[0].valor).toBe(85);
    expect(data.proventos[0].valorUnitario).toBe(0.85); // exibido = líquido
    expect(data.kpis.rendaAcumulada.periodo).toBe(85);
  });

  // Lacuna 3 (auditoria 2026-05-19): mirror BRAPI→PortfolioProvento duplicava
  // proventos quando ambos os caminhos eram somados sem dedup.
  it('dedupa BRAPI dividend quando há PortfolioProvento espelhado pro mesmo evento', async () => {
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
        stockId: 's1',
        assetId: 'asset-1',
        asset: { id: 'asset-1', symbol: 'ITUB4', name: 'Itaú', type: 'stock' },
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
        stockId: 's1',
        assetId: 'asset-1',
        asset: { symbol: 'ITUB4', name: 'Itaú', type: 'stock' },
      },
    ]);
    // BRAPI tem o evento
    mockGetDividends.mockResolvedValue([
      {
        date: dividendDate,
        tipo: 'Dividendo',
        valorUnitario: 0.5,
        valorUnitarioLiquido: 0.5,
      },
    ]);
    // E PortfolioProvento espelha o mesmo (típico do auto-mirror)
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        id: 'pp-mirror',
        portfolioId: 'p1',
        userId: 'user-123',
        tipo: 'Dividendo',
        dataCom: dividendDate,
        dataPagamento: dividendDate,
        precificarPor: 'valor',
        valorTotal: 50, // 100 cotas × 0.5
        quantidadeBase: 100,
        impostoRenda: null,
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['ITUB4', 35]]));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    // Sem dedup: total = 50 (BRAPI) + 50 (PP) = 100. Com dedup: 50 (única fonte).
    expect(data.proventos.length).toBe(1);
    expect(data.kpis.rendaAcumulada.periodo).toBe(50);
  });

  // Lacuna 1 (2º passe): PortfolioProvento JCP com impostoRenda=null (caso do
  // mirror legacy) deve cair no fallback de IRRF (17,5% pós-LC 224/2025 a
  // partir de 01/01/2026; 15% antes) para não inflar o total.
  it('JCP manual com impostoRenda=null usa fallback de IRRF', async () => {
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
        stockId: 's1',
        assetId: 'asset-1',
        asset: { id: 'asset-1', symbol: 'ITUB4', name: 'Itaú', type: 'stock' },
      },
    ]);
    mockGetDividends.mockResolvedValue([]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        id: 'pp-jcp-legacy',
        portfolioId: 'p1',
        userId: 'user-123',
        tipo: 'JCP',
        dataCom: jcpDate,
        dataPagamento: jcpDate,
        precificarPor: 'valor',
        valorTotal: 100, // bruto
        quantidadeBase: 100,
        impostoRenda: null, // legacy mirror não populava
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['ITUB4', 35]]));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBe(1);
    // 100 bruto × 0.825 = 82,5 líquido (17,5% IRRF, LC 224/2025 vigente em 2026+)
    expect(data.proventos[0].valor).toBe(82.5);
    expect(data.kpis.rendaAcumulada.periodo).toBe(82.5);
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { id: 'asset-2', symbol: 'ITUB4', name: 'Itau', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { symbol: 'ITUB4', name: 'ITUB4', type: 'stock' },
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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { id: 'asset-2', symbol: 'ITUB4', name: 'Itau', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { symbol: 'ITUB4', name: 'ITUB4', type: 'stock' },
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

  // Bug #01: dividendo com data-com anterior à compra do investidor não deve contar.
  // Cenário: PETR4 comprado em 18/06/2025; dividendo com dataCom=02/06/2025 e
  // paymentDate=20/08/2025. O investidor NÃO tem direito (comprou depois do ex-date),
  // mesmo que o pagamento seja após a compra.
  it('exclui dividendo com dataCom anterior à compra (Bug #01)', async () => {
    const now = new Date();
    const purchaseDate = new Date(now.getTime() - 60 * 86400000);
    const exDate = new Date(purchaseDate.getTime() - 16 * 86400000);
    const paymentDate = new Date(purchaseDate.getTime() + 63 * 86400000); // pago depois da compra

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: purchaseDate,
        stockId: 'stock-1',
        assetId: null,
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        date: purchaseDate,
        stockId: 'stock-1',
        assetId: null,
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 35]]));
    mockGetDividends.mockResolvedValue([
      {
        date: paymentDate,
        dataCom: exDate,
        tipo: 'Dividendo',
        valorUnitario: 0.5,
      },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('inclui dividendo com dataCom posterior à compra', async () => {
    const now = new Date();
    const purchaseDate = new Date(now.getTime() - 60 * 86400000);
    const exDate = new Date(purchaseDate.getTime() + 10 * 86400000);
    const paymentDate = new Date(purchaseDate.getTime() + 40 * 86400000);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: purchaseDate,
        stockId: 'stock-1',
        assetId: null,
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        date: purchaseDate,
        stockId: 'stock-1',
        assetId: null,
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 35]]));
    mockGetDividends.mockResolvedValue([
      {
        date: paymentDate,
        dataCom: exDate,
        tipo: 'Dividendo',
        valorUnitario: 0.5,
      },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBe(1);
    expect(data.total).toBe(50); // 100 cotas × 0.5
  });

  // Fallback: entradas legadas pré-migration (dataCom=null) usam paymentDate como
  // referência de elegibilidade. Mantém compat sem precisar de re-sync forçado.
  it('legado sem dataCom usa paymentDate como elegibilidade', async () => {
    const now = new Date();
    const purchaseDate = new Date(now.getTime() - 60 * 86400000);
    const paymentDateAntes = new Date(purchaseDate.getTime() - 10 * 86400000);
    const paymentDateDepois = new Date(purchaseDate.getTime() + 10 * 86400000);

    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: purchaseDate,
        stockId: 'stock-1',
        assetId: null,
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        date: purchaseDate,
        stockId: 'stock-1',
        assetId: null,
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 35]]));
    mockGetDividends.mockResolvedValue([
      { date: paymentDateAntes, dataCom: null, tipo: 'Dividendo', valorUnitario: 0.5 },
      { date: paymentDateDepois, dataCom: null, tipo: 'Dividendo', valorUnitario: 0.5 },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBe(1);
    expect(data.total).toBe(50);
  });

  // Bug F1.2: paymentDate corrompido (epoch zero ou pré-Plano Real) chegando da
  // BRAPI/DB virava barra "Jan 1970" no gráfico de proventos. A rota agora
  // filtra qualquer provento com data < 1990-01-01 antes de devolver ao cliente.
  it('descarta proventos com data epoch-zero ou pré-1990 (regressão F1.2)', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 86400000);
    const validDate = new Date(now.getTime() - 10 * 86400000);

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
        asset: { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
      },
    ]);

    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 35]]));

    mockGetDividends.mockResolvedValue([
      // Epoch UTC zero — caso clássico (BRAPI paymentDate: 0).
      { date: new Date(0), dataCom: null, tipo: 'Dividendo', valorUnitario: 0.7 },
      // Pré-1990 — também é lixo (pré-Real, BRAPI não cobre).
      { date: new Date('1985-06-15'), dataCom: null, tipo: 'Dividendo', valorUnitario: 0.7 },
      // Válido — único que deve aparecer no resultado.
      { date: validDate, dataCom: null, tipo: 'Dividendo', valorUnitario: 0.5 },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.proventos.length).toBe(1);
    expect(data.proventos[0].data).toBe(validDate.toISOString());
    // Garante que nenhuma data com prefixo "197" (epoch zero) vazou pro payload.
    expect(data.proventos.every((p: { data: string }) => !p.data.startsWith('19'))).toBe(true);
  });
});
