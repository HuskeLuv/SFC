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
  // Série USD-BRL (câmbio dos proventos EUA e fallback das operações sem cotação).
  assetPriceHistory: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  },
}));

const mockGetDividends = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
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
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
      },
      {
        type: 'venda',
        date: new Date('2025-02-15'),
        quantity: 1000,
        price: 38,
        fees: 0,
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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
        asset: { symbol: 'ITUB4', name: 'ITUB4', type: 'stock' },
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
        asset: { symbol: 'HGLG11', name: 'HGLG11', type: 'fii' },
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
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
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

  describe('Carteira EUA em US$', () => {
    const REIT = {
      symbol: 'O-1700000000000-abc',
      name: 'Realty Income',
      type: 'reit',
      currency: 'USD',
    };

    it('provento de REIT sai dos isentos e entra em Exterior, convertido pela data de pagamento', async () => {
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
        { date: new Date('2025-01-02'), price: 5 },
        { date: new Date('2025-03-10'), price: 5.5 },
      ]);
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p-reit',
          userId: 'user-123',
          quantity: 100,
          totalInvested: 5000,
          avgPrice: 50,
          lastUpdate: new Date('2025-01-15'),
          asset: REIT,
        },
      ]);
      mockGetDividends.mockResolvedValue([
        { date: new Date('2025-03-15'), tipo: 'Dividendo', valorUnitario: 0.25 }, // US$ 25
      ]);
      mockPrisma.portfolioProvento.findMany.mockResolvedValue([
        {
          portfolioId: 'p-reit',
          dataPagamento: new Date('2025-02-15'),
          tipo: 'Dividendo',
          valorTotal: 10, // US$ 10 manual, câmbio 5
        },
      ]);

      const response = await GET(createRequest('2025'));
      const data = await response.json();
      expect(data.rendimentos.isentos.total).toBe(0);
      expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(0);
      // 25 × 5,5 + 10 × 5 = 187,50
      expect(data.rendimentos.exterior.total).toBe(187.5);
      expect(data.rendimentos.exterior.semCambio).toBe(0);
      expect(data.rendimentos.totalRecebido).toBe(187.5);
      expect(data.observacoes.some((o: string) => o.startsWith('Exterior (tributável)'))).toBe(
        true,
      );
    });

    it('provento EUA sem câmbio na data fica fora da soma (nunca soma US$ como R$)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p-reit',
          userId: 'user-123',
          quantity: 100,
          totalInvested: 5000,
          avgPrice: 50,
          lastUpdate: new Date('2025-01-15'),
          asset: REIT,
        },
      ]);
      mockGetDividends.mockResolvedValue([
        { date: new Date('2025-03-15'), tipo: 'Dividendo', valorUnitario: 0.25 },
      ]);
      const response = await GET(createRequest('2025'));
      const data = await response.json();
      expect(data.rendimentos.exterior.total).toBe(0);
      expect(data.rendimentos.exterior.semCambio).toBe(1);
      expect(data.rendimentos.totalRecebido).toBe(0);
    });

    it('PETR4 com cotacaoMoeda nas notes continua em renda variável BR, nunca em Stocks US', async () => {
      const petr4 = { symbol: 'PETR4', name: 'PETR4', type: 'stock', currency: 'BRL' };
      const notes = JSON.stringify({
        operation: { moeda: 'USD', cotacaoMoeda: 5, unidade: 'USD' },
      });
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          type: 'compra',
          date: new Date('2025-01-15'),
          quantity: 1000,
          price: 30,
          fees: 0,
          notes,
          asset: petr4,
        },
        {
          type: 'venda',
          date: new Date('2025-02-15'),
          quantity: 1000,
          price: 38,
          fees: 0,
          notes,
          asset: petr4,
        },
      ]);
      const response = await GET(createRequest('2025'));
      const data = await response.json();
      expect(data.irPorCategoria.stocksUs).toBe(0);
      expect(data.irPorCategoria.rendaVariavelBr).toBe(1200);
      expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
    });

    it('stock EUA em US$ com venda acima de R$ 35 mil entra em stocksUs (preço pela unidade)', async () => {
      const aapl = {
        symbol: 'AAPL-1700000000000-abc',
        name: 'Apple',
        type: 'stock',
        currency: 'USD',
      };
      const notesUsd = (fx: number) =>
        JSON.stringify({ operation: { moeda: 'USD', unidade: 'USD', cotacaoMoeda: fx } });
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          type: 'compra',
          date: new Date('2025-01-15'),
          quantity: 100,
          price: 100,
          fees: 0,
          notes: notesUsd(5),
          asset: aapl,
        },
        {
          type: 'venda',
          date: new Date('2025-02-15'),
          quantity: 100,
          price: 100,
          fees: 0,
          notes: notesUsd(6),
          asset: aapl,
        },
      ]);
      const response = await GET(createRequest('2025'));
      const data = await response.json();
      // Receita 60.000, custo 50.000 → lucro 10.000 × 15% = 1.500 (e nada em RV BR).
      expect(data.irPorCategoria.stocksUs).toBe(1500);
      expect(data.irPorCategoria.rendaVariavelBr).toBe(0);
    });
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
