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
  stockTransaction: { findMany: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET } from '../route';

const createRequest = () =>
  new NextRequest('http://localhost/api/analises/ir-stocks-us', { method: 'GET' });

const buildTx = (overrides: {
  type: 'compra' | 'venda';
  date: Date;
  symbol: string;
  assetType: string;
  quantity: number;
  price: number;
  cotacaoMoeda: number | null;
  moeda?: string;
  fees?: number;
}) => ({
  type: overrides.type,
  date: overrides.date,
  quantity: overrides.quantity,
  price: overrides.price,
  fees: overrides.fees ?? 0,
  asset: { symbol: overrides.symbol, type: overrides.assetType },
  notes: JSON.stringify({
    operation: {
      moeda: overrides.moeda ?? 'USD',
      cotacaoMoeda: overrides.cotacaoMoeda,
    },
  }),
});

describe('GET /api/analises/ir-stocks-us', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('retorna apuracao vazia quando não há transações em USD', async () => {
    const response = await GET(createRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.meses).toEqual([]);
  });

  it('inclui Stocks US (asset.type=stock) com cotacaoMoeda na apuração', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'VOO',
        assetType: 'stock',
        quantity: 10,
        price: 500,
        cotacaoMoeda: 5,
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'VOO',
        assetType: 'stock',
        quantity: 10,
        price: 600,
        cotacaoMoeda: 5,
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    expect(feb).toBeDefined();
    expect(feb.lucroBrutoBrl).toBe(5000); // 10 * (600-500) * 5
  });

  it('inclui REITs (asset.type=reit) com mesmo tratamento', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'O',
        assetType: 'reit',
        quantity: 100,
        price: 50,
        cotacaoMoeda: 5,
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'O',
        assetType: 'reit',
        quantity: 100,
        price: 60,
        cotacaoMoeda: 5,
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    expect(feb.lucroBrutoBrl).toBe(5000);
  });

  it('ignora ações BR, FII, ETF e BDR (não são ME)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      // BDR (negociada em BRL na B3, asset.type='bdr')
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'AAPL34',
        assetType: 'bdr',
        quantity: 100,
        price: 50,
        cotacaoMoeda: 5,
      }),
      // ETF
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'BOVA11',
        assetType: 'etf',
        quantity: 100,
        price: 130,
        cotacaoMoeda: null,
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.meses).toEqual([]);
  });

  it('ignora transações sem cotacaoMoeda no notes', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        price: 200,
        cotacaoMoeda: null, // sem fx → ignorada
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.meses).toEqual([]);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });
});
