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
  portfolio: { findMany: vi.fn().mockResolvedValue([]) },
  portfolioProvento: { findMany: vi.fn().mockResolvedValue([]) },
}));

const mockGetDividends = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/pricing/dividendService', () => ({
  getDividends: mockGetDividends,
}));

import { GET } from '../route';

const createRequest = (year?: string) => {
  const url = new URL('http://localhost/api/analises/ir-resumo-anual');
  if (year) url.searchParams.set('year', year);
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/analises/ir-resumo-anual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([]);
    mockGetDividends.mockResolvedValue([]);
  });

  it('retorna estrutura zerada quando não há dados', async () => {
    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.year).toBe(2025);
    expect(data.irPorCategoria.total).toBe(0);
    expect(data.rendimentos.totalRecebido).toBe(0);
  });

  it('agrega IR de venda de ação acima de 20k em rendaVariavelBr do ano', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: 'compra',
        date: new Date('2025-01-15'),
        quantity: 1000,
        price: 30,
        fees: 0,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
      {
        type: 'venda',
        date: new Date('2025-02-15'),
        quantity: 1000,
        price: 38,
        fees: 0,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
    ]);
    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(data.irPorCategoria.rendaVariavelBr).toBe(1200); // (38-30)*1000*0.15
    expect(data.irPorCategoria.total).toBe(1200);
  });

  it('classifica dividendos brapi de ação BR como isento', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: new Date('2025-01-15'),
        stockId: 's1',
        stock: { ticker: 'PETR4' },
        asset: null,
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: new Date('2025-03-15'), tipo: 'Dividendo', valorUnitario: 0.5 }, // 100*0.5=50
    ]);

    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(50);
    expect(data.rendimentos.isentos.total).toBe(50);
    expect(data.rendimentos.tributacaoExclusiva.jcp).toBe(0);
  });

  it('classifica JCP brapi como tributação exclusiva', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: new Date('2025-01-15'),
        stockId: 's1',
        stock: { ticker: 'ITUB4' },
        asset: null,
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: new Date('2025-03-15'), tipo: 'JCP', valorUnitario: 1.0 }, // 100
    ]);
    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(data.rendimentos.tributacaoExclusiva.jcp).toBe(100);
    expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(0);
  });

  it('classifica rendimento de FII (BRAPI) como isento', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 10,
        totalInvested: 1000,
        avgPrice: 100,
        lastUpdate: new Date('2025-01-15'),
        stockId: 's1',
        stock: { ticker: 'HGLG11' },
        asset: null,
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: new Date('2025-03-15'), tipo: 'Rendimento', valorUnitario: 1.0 }, // 10
    ]);
    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(data.rendimentos.isentos.rendimentosFii).toBe(10);
    expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(0);
  });

  it('exclui proventos fora do ano consultado', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        lastUpdate: new Date('2024-01-15'),
        stockId: 's1',
        stock: { ticker: 'PETR4' },
        asset: null,
      },
    ]);
    mockGetDividends.mockResolvedValue([
      { date: new Date('2024-03-15'), tipo: 'Dividendo', valorUnitario: 0.5 },
      { date: new Date('2025-03-15'), tipo: 'Dividendo', valorUnitario: 1.0 },
    ]);
    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(100); // só 2025
  });

  it('rejeita year inválido', async () => {
    const response = await GET(createRequest('abc'));
    expect(response.status).toBe(400);
  });

  it('default year = ano corrente quando não informado', async () => {
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.year).toBe(new Date().getFullYear());
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createRequest('2025'));
    expect(response.status).toBe(401);
  });
});
