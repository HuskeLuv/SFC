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
  new NextRequest('http://localhost/api/analises/ir-cripto', { method: 'GET' });

const buildTx = (params: {
  type: 'compra' | 'venda';
  date: Date;
  symbol: string;
  assetType: string;
  quantity: number;
  price: number;
  fees?: number;
}) => ({
  type: params.type,
  date: params.date,
  quantity: params.quantity,
  price: params.price,
  fees: params.fees ?? 0,
  asset: { symbol: params.symbol, type: params.assetType },
  notes: null,
});

describe('GET /api/analises/ir-cripto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('retorna apuracao vazia quando não há transações de cripto', async () => {
    const response = await GET(createRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.meses).toEqual([]);
  });

  it('inclui asset.type=crypto na apuração e aplica isenção 35k', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'BTC',
        assetType: 'crypto',
        quantity: 0.1,
        price: 200000,
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'BTC',
        assetType: 'crypto',
        quantity: 0.1,
        price: 220000, // receita 22000 ≤ 35k
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    expect(feb.isento).toBe(true);
    expect(feb.lucroBruto).toBe(2000);
    expect(feb.irDevido).toBe(0);
  });

  it('ignora ações, FII, ETF e stocks US', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'PETR4',
        assetType: 'stock',
        quantity: 100,
        price: 30,
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'HGLG11',
        assetType: 'fii',
        quantity: 10,
        price: 200,
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.meses).toEqual([]);
  });

  it('inclui asset.type=currency (moedas estrangeiras como USD)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'USD',
        assetType: 'currency',
        quantity: 1000,
        price: 5,
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'USD',
        assetType: 'currency',
        quantity: 1000,
        price: 6,
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    expect(feb).toBeDefined();
    expect(feb.lucroBruto).toBe(1000);
  });
});
