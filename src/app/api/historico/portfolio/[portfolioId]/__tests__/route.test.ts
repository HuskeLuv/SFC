import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET } from '../route';

const createRequest = () =>
  new NextRequest('http://localhost/api/historico/portfolio/port-1', { method: 'GET' });

const callGET = (portfolioId = 'port-1') =>
  GET(createRequest(), { params: Promise.resolve({ portfolioId }) });

describe('GET /api/historico/portfolio/[portfolioId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('retorna histórico do portfolio com transações', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      quantity: 100,
      avgPrice: 25,
      totalInvested: 2500,
      asset: { symbol: 'PETR4', name: 'Petrobras' },
      stock: null,
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        type: 'compra',
        quantity: 100,
        price: 25,
        total: 2500,
        date: new Date('2024-01-15'),
        fees: 5,
        notes: null,
      },
    ]);

    const response = await callGET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.portfolio.id).toBe('port-1');
    expect(data.portfolio.symbol).toBe('PETR4');
    expect(data.historico).toHaveLength(1);
    expect(data.historico[0].tipoOperacao).toBe('Aporte');
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(
      Object.assign(new Error('Não autorizado'), { status: 401 }),
    );

    const response = await callGET();
    expect(response.status).toBe(401);
  });

  it('retorna 404 quando portfolio não encontrado', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);

    const response = await callGET('nonexistent');
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Portfólio não encontrado');
  });

  it('mapeia tipo venda para Resgate', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-1',
      userId: 'user-1',
      assetId: 'asset-1',
      stockId: null,
      quantity: 50,
      avgPrice: 25,
      totalInvested: 1250,
      asset: { symbol: 'PETR4', name: 'Petrobras' },
      stock: null,
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        type: 'venda',
        quantity: 50,
        price: 30,
        total: 1500,
        date: new Date('2024-02-01'),
        fees: 5,
        notes: null,
      },
    ]);

    const response = await callGET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.historico[0].tipoOperacao).toBe('Resgate');
  });
});
