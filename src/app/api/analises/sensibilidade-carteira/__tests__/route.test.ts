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
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  cashflowGroup: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  portfolioSensibilidadeCache: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

const mockGetAssetHistory = vi.hoisted(() => vi.fn());
const mockBuildPatrimonioHistorico = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', async () => {
  const actual = await vi.importActual<typeof import('@/services/pricing/assetPriceService')>(
    '@/services/pricing/assetPriceService',
  );
  return {
    ...actual,
    getAssetHistory: mockGetAssetHistory,
  };
});
vi.mock('@/services/portfolio/patrimonioHistoricoBuilder', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/portfolio/patrimonioHistoricoBuilder')
  >('@/services/portfolio/patrimonioHistoricoBuilder');
  return {
    ...actual,
    buildPatrimonioHistorico: mockBuildPatrimonioHistorico,
  };
});

import { GET } from '../route';

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/analises/sensibilidade-carteira');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url, { method: 'GET' });
};

/** Converte série de retornos mensais em TWR acumulado {data, value%} — formato do builder. */
const twrFromMonthlyReturns = (
  months: string[],
  returns: number[],
): Array<{ data: number; value: number }> => {
  // pivô base: 0% no mês anterior ao primeiro retorno
  const all = [{ ym: months[0], twr: 0 }];
  let acc = 1;
  for (let i = 0; i < returns.length; i++) {
    acc *= 1 + returns[i];
    all.push({ ym: months[i + 1], twr: (acc - 1) * 100 });
  }
  return all.map(({ ym, twr }) => {
    const [y, m] = ym.split('-').map(Number);
    return { data: Date.UTC(y, m - 1, 28), value: twr };
  });
};

describe('GET /api/analises/sensibilidade-carteira', () => {
  const portfolioReturns = [
    0.01, 0.02, -0.01, 0.015, 0.005, -0.02, 0.01, 0.025, 0.0, 0.018, -0.005, 0.012, 0.008,
  ];
  const months = [
    '2024-01',
    '2024-02',
    '2024-03',
    '2024-04',
    '2024-05',
    '2024-06',
    '2024-07',
    '2024-08',
    '2024-09',
    '2024-10',
    '2024-11',
    '2024-12',
    '2025-01',
    '2025-02',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolioSensibilidadeCache.findUnique.mockResolvedValue(null);
    mockPrisma.portfolioSensibilidadeCache.upsert.mockResolvedValue({});
    mockGetAssetHistory.mockResolvedValue([]);
    mockBuildPatrimonioHistorico.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: twrFromMonthlyReturns(months, portfolioReturns),
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });
  });

  it('rejeita windowMonths fora da faixa', async () => {
    const resp = await GET(createRequest({ windowMonths: '6' }));
    expect(resp.status).toBe(400);
  });

  it('retorna resposta vazia e não consulta cache para carteira sem ativos de mercado', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        assetId: 'a1',
        quantity: 1,
        avgPrice: 100,
        totalInvested: 100,
        asset: { symbol: 'RENDA-FIXA-CDB', name: 'CDB XPTO', currentPrice: 100 },
        stock: null,
      },
    ]);
    const resp = await GET(createRequest());
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(body.ativos).toEqual([]);
    expect(mockPrisma.portfolioSensibilidadeCache.findUnique).not.toHaveBeenCalled();
  });

  it('calcula, retorna e persiste no cache no happy path', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        assetId: 'a1',
        quantity: 100,
        avgPrice: 30,
        totalInvested: 3000,
        asset: { symbol: 'PETR4', name: 'Petrobras', currentPrice: 35 },
        stock: null,
      },
    ]);
    // Histórico diário do PETR4 espelhando os retornos da carteira → correl = 1
    const daily: Array<{ date: number; value: number }> = [];
    let price = 100;
    const [y0, m0] = months[0].split('-').map(Number);
    daily.push({ date: Date.UTC(y0, m0 - 1, 28), value: price });
    for (let i = 0; i < portfolioReturns.length; i++) {
      price *= 1 + portfolioReturns[i];
      const [y, m] = months[i + 1].split('-').map(Number);
      daily.push({ date: Date.UTC(y, m - 1, 28), value: price });
    }
    mockGetAssetHistory.mockResolvedValue(daily);

    const resp = await GET(createRequest({ windowMonths: '24' }));
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.ativos).toHaveLength(1);
    expect(body.ativos[0].ticker).toBe('PETR4');
    expect(body.ativos[0].correlacao).toBeCloseTo(1, 6);
    expect(body.ativos[0].bucket).toBe('alta');
    expect(mockPrisma.portfolioSensibilidadeCache.upsert).toHaveBeenCalledOnce();
  });

  it('serve do cache sem recomputar quando o portfolioHash coincide e TTL está válido', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        assetId: 'a1',
        quantity: 100,
        avgPrice: 30,
        totalInvested: 3000,
        asset: { symbol: 'PETR4', name: 'Petrobras', currentPrice: 35 },
        stock: null,
      },
    ]);

    // Precalcula o hash pelo mesmo formato usado no endpoint: "SYMBOL:qty:price"
    const { createHash } = await import('crypto');
    const expectedHash = createHash('sha256').update('PETR4:100:35').digest('hex');

    const cachedPayload = { ativos: [{ ticker: 'CACHED' }], windowMonths: 24 };
    mockPrisma.portfolioSensibilidadeCache.findUnique.mockResolvedValue({
      portfolioHash: expectedHash,
      computedAt: new Date(),
      payload: cachedPayload,
    });

    const resp = await GET(createRequest({ windowMonths: '24' }));
    const body = await resp.json();

    expect(body).toEqual(cachedPayload);
    expect(mockBuildPatrimonioHistorico).not.toHaveBeenCalled();
    expect(mockGetAssetHistory).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioSensibilidadeCache.upsert).not.toHaveBeenCalled();
  });

  it('recomputa quando o portfolioHash mudou', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        assetId: 'a1',
        quantity: 100,
        avgPrice: 30,
        totalInvested: 3000,
        asset: { symbol: 'PETR4', name: 'Petrobras', currentPrice: 35 },
        stock: null,
      },
    ]);
    mockPrisma.portfolioSensibilidadeCache.findUnique.mockResolvedValue({
      portfolioHash: 'stale-hash-different',
      computedAt: new Date(),
      payload: { stale: true },
    });
    mockGetAssetHistory.mockResolvedValue([]);

    await GET(createRequest({ windowMonths: '24' }));
    expect(mockBuildPatrimonioHistorico).toHaveBeenCalledOnce();
    expect(mockPrisma.portfolioSensibilidadeCache.upsert).toHaveBeenCalledOnce();
  });
});
