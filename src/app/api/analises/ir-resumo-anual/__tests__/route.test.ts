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

const mockResolveProventoEvents = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ events: [], total: 0 }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: mockResolveProventoEvents,
}));

const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
/** Evento do resolvedor (histórico global × quantidade na data-com, overrides aplicados). */
const evento = (
  symbol: string,
  pagamento: string,
  tipo: string,
  gross: number,
  net = gross,
  moeda: 'BRL' | 'USD' = 'BRL',
) => ({
  symbol,
  paymentDay: dia(pagamento),
  exDay: dia(pagamento),
  bookingDay: dia(pagamento),
  tipo,
  moeda,
  gross,
  net,
});
const proventos = (...events: ReturnType<typeof evento>[]) =>
  mockResolveProventoEvents.mockResolvedValue({ events, total: 0 });

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
    mockResolveProventoEvents.mockResolvedValue({ events: [], total: 0 });
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
    proventos(evento('PETR4', '2025-03-15', 'Dividendo', 50));

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
    proventos(evento('ITUB4', '2025-03-15', 'JCP', 100, 85)); // bruto 100, líquido 85
    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(data.rendimentos.tributacaoExclusiva.jcp).toBe(85);
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
    proventos(evento('HGLG11', '2025-03-15', 'Rendimento', 10));
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
    proventos(
      evento('PETR4', '2024-03-15', 'Dividendo', 50),
      evento('PETR4', '2025-03-15', 'Dividendo', 100),
    );
    const response = await GET(createRequest('2025'));
    const data = await response.json();
    expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(100); // só 2025
  });

  it('conta cada provento uma vez: não lê o espelho brapi de portfolio_proventos', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        asset: { symbol: 'PETR4', type: 'stock' },
      },
    ]);
    // O espelho 'brapi' do mesmo pagamento existe no banco, mas não pode somar de novo.
    mockPrisma.portfolioProvento.findMany.mockResolvedValue([
      {
        portfolioId: 'p1',
        source: 'brapi',
        dataPagamento: new Date('2025-03-15'),
        tipo: 'Dividendo',
        valorTotal: 50,
      },
    ]);
    proventos(evento('PETR4', '2025-03-15', 'Dividendo', 50));

    const data = await (await GET(createRequest('2025'))).json();
    expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(50);
    expect(data.rendimentos.totalRecebido).toBe(50);
  });

  it('ano corrente: provento com pagamento futuro (provisionado) não entra', async () => {
    const ano = new Date().getUTCFullYear();
    const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        quantity: 100,
        totalInvested: 3000,
        avgPrice: 30,
        asset: { symbol: 'PETR4', type: 'stock' },
      },
    ]);
    proventos(
      evento('PETR4', `${ano}-01-02`, 'Dividendo', 40),
      ...(amanha.startsWith(String(ano)) ? [evento('PETR4', amanha, 'Dividendo', 60)] : []),
    );

    const data = await (await GET(createRequest(String(ano)))).json();
    expect(data.rendimentos.isentos.dividendosAcoesBr).toBe(40);
  });

  it('ETF e reserva não entram nos rendimentos do IR', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        quantity: 10,
        totalInvested: 1000,
        avgPrice: 100,
        asset: { symbol: 'BOVA11', type: 'etf' },
      },
    ]);
    proventos(
      evento('BOVA11', '2025-03-15', 'Dividendo', 7),
      evento('RESERVA-EMERG-1', '2025-03-15', 'Rendimento', 9),
    );
    const data = await (await GET(createRequest('2025'))).json();
    expect(data.rendimentos.totalRecebido).toBe(0);
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
      proventos(
        evento(REIT.symbol, '2025-03-15', 'Dividendo', 25, 25, 'USD'),
        evento(REIT.symbol, '2025-02-15', 'Dividendo', 10, 10, 'USD'), // manual, câmbio 5
      );

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
      proventos(evento(REIT.symbol, '2025-03-15', 'Dividendo', 25, 25, 'USD'));
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
