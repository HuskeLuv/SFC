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
  new NextRequest('http://localhost/api/analises/ir-mensal', { method: 'GET' });

describe('GET /api/analises/ir-mensal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('retorna apuracao vazia quando não há transações', async () => {
    const response = await GET(createRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.meses).toEqual([]);
    expect(data.saldosPrejuizoAtual).toEqual({ rvComum: 0, fii: 0 });
  });

  it('categoriza ticker terminado em 11 como FII e calcula 20%', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: 'compra',
        date: new Date('2025-01-15'),
        quantity: 10,
        price: 100,
        fees: 0,
        stock: { ticker: 'HGLG11' },
        asset: null,
      },
      {
        type: 'venda',
        date: new Date('2025-02-15'),
        quantity: 10,
        price: 150,
        fees: 0,
        stock: { ticker: 'HGLG11' },
        asset: null,
      },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    expect(feb.porCategoria.fii.aliquota).toBe(0.2);
    expect(feb.porCategoria.fii.irDevido).toBe(100); // 500 * 0.2
  });

  it('categoriza Asset.type=etf como etf_br (sem isenção 20k)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: 'compra',
        date: new Date('2025-01-15'),
        quantity: 100,
        price: 100,
        fees: 0,
        stock: null,
        asset: { symbol: 'BOVA11', type: 'etf' },
      },
      {
        type: 'venda',
        date: new Date('2025-02-15'),
        quantity: 100,
        price: 110,
        fees: 0,
        stock: null,
        asset: { symbol: 'BOVA11', type: 'etf' },
      },
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    expect(feb.porCategoria.etf_br.isento).toBe(false);
    expect(feb.porCategoria.etf_br.irDevido).toBe(150); // 1000 * 0.15
  });

  it('ignora transações de stocks US, crypto, fundo e previdência', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: 'venda',
        date: new Date('2025-02-15'),
        quantity: 10,
        price: 200,
        fees: 0,
        stock: null,
        asset: { symbol: 'AAPL', type: 'stock' },
      },
      {
        type: 'venda',
        date: new Date('2025-02-15'),
        quantity: 1,
        price: 300000,
        fees: 0,
        stock: null,
        asset: { symbol: 'BTC', type: 'crypto' },
      },
      {
        type: 'venda',
        date: new Date('2025-02-15'),
        quantity: 100,
        price: 12,
        fees: 0,
        stock: null,
        asset: { symbol: 'TREND-DI', type: 'fund' },
      },
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    // Stocks US, crypto e fund → categorizam como null e são pulados na apuração.
    expect(data.meses).toEqual([]);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });
});
