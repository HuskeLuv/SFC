import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

/**
 * Carteira EUA em US$ (fatia FA): resgate de Stock EUA/REIT. O corpo manda o preço em US$ e a
 * cotação do dólar (obrigatória); a rota normaliza para a unidade da posição, grava o marcador
 * e credita o caixa sem dupla conversão.
 */
const mockPrisma = vi.hoisted(() => {
  const base = {
    userChangeLog: { create: vi.fn() },
    portfolio: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    stockTransaction: { create: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    fixedIncomeAsset: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(),
  };
  base.$transaction.mockImplementation((fn: (tx: typeof base) => unknown) => fn(base));
  return base;
});

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  invalidatePortfolioSnapshots: vi.fn().mockResolvedValue(undefined),
  recalculatePortfolioFromTransactions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: vi.fn().mockResolvedValue(undefined),
}));
const mockGetIndicator = vi.hoisted(() => vi.fn());
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: mockGetIndicator }));
const mockCaixa = vi.hoisted(() => ({
  debitarCaixa: vi.fn(),
  creditarCaixa: vi.fn(),
  resolverCaixaAba: vi.fn(),
  invalidateCaixaCaches: vi.fn(),
}));
vi.mock('@/services/portfolio/caixaParaInvestir', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portfolio/caixaParaInvestir')>()),
  ...mockCaixa,
}));

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/resgate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const posicao = (over: Record<string, unknown> = {}) => ({
  id: 'port-aapl',
  userId: 'user-123',
  quantity: 10,
  totalInvested: 1000,
  avgPrice: 100,
  assetId: 'asset-aapl',
  moedaRegistro: 'USD',
  categoriaOverride: null,
  planejamentoObjetivoId: null,
  asset: {
    symbol: 'AAPL-1-x',
    name: 'AAPL',
    type: 'stock',
    currency: 'USD',
    source: 'manual',
  },
  ...over,
});

const venda = {
  portfolioId: 'port-aapl',
  dataResgate: '2026-03-10',
  metodoResgate: 'quantidade',
  quantidade: 4,
  cotacaoUnitaria: 150,
  cotacaoMoeda: 5.5,
  creditarCaixa: true,
};

const dadosDaVenda = () => mockPrisma.stockTransaction.create.mock.calls[0][0].data;
const operacaoDasNotes = () => JSON.parse(dadosDaVenda().notes).operation;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );
  mockPrisma.portfolio.findFirst.mockResolvedValue(posicao());
  mockPrisma.stockTransaction.findFirst.mockResolvedValue({ date: new Date('2026-01-10') });
  mockPrisma.stockTransaction.create.mockImplementation((args: { data: object }) =>
    Promise.resolve({ id: 'tx-v', ...args.data }),
  );
  mockCaixa.creditarCaixa.mockImplementation((_tx, _u, valor: number) =>
    Promise.resolve({ total: valor, aba: null }),
  );
  mockGetIndicator.mockResolvedValue({ price: 9.99 });
});

describe('POST /api/carteira/resgate — ativo em dólar', () => {
  it('sem cotacaoMoeda dá 400 e não grava nada', async () => {
    const { cotacaoMoeda: _sem, ...corpo } = venda;
    const res = await POST(createRequest(corpo));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('cotação do dólar');
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('REIT sem cotacaoMoeda também dá 400', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao({
        moedaRegistro: null,
        asset: { symbol: 'O', name: 'Realty', type: 'reit', currency: 'USD' },
      }),
    );
    const { cotacaoMoeda: _sem, ...corpo } = venda;
    const res = await POST(createRequest(corpo));
    expect(res.status).toBe(400);
  });

  it('posição em US$: grava US$, marcador USD e credita total × câmbio', async () => {
    const res = await POST(createRequest(venda));
    expect(res.status).toBe(201);

    const data = dadosDaVenda();
    expect(data.price).toBe(150);
    expect(data.total).toBe(600);
    expect(operacaoDasNotes()).toMatchObject({ unidade: 'USD', moeda: 'USD', cotacaoMoeda: 5.5 });
    // 600 × 5,5 — a cotação do corpo, nunca a do indicador
    expect(mockCaixa.creditarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 3300);
    expect(mockGetIndicator).not.toHaveBeenCalled();
  });

  it('REIT legado (moedaRegistro null) é US$', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao({
        moedaRegistro: null,
        asset: { symbol: 'O', name: 'Realty', type: 'reit', currency: 'USD' },
      }),
    );
    const res = await POST(createRequest(venda));
    expect(res.status).toBe(201);
    expect(dadosDaVenda().total).toBe(600);
    expect(operacaoDasNotes().unidade).toBe('USD');
  });

  it('stock legado em R$: converte o preço × câmbio e credita sem dupla conversão', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao({ moedaRegistro: null, avgPrice: 520, totalInvested: 5200 }),
    );
    const res = await POST(createRequest(venda));
    expect(res.status).toBe(201);

    const data = dadosDaVenda();
    expect(data.price).toBeCloseTo(825, 6); // US$ 150 × 5,5
    expect(data.total).toBeCloseTo(3300, 6);
    expect(operacaoDasNotes()).toMatchObject({ unidade: 'BRL', moeda: 'USD', cotacaoMoeda: 5.5 });
    expect(mockCaixa.creditarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 3300);
  });

  it('ação BR (PETR4) não exige câmbio nem ganha marcador', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao({
        moedaRegistro: null,
        asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' },
      }),
    );
    const { cotacaoMoeda: _sem, ...corpo } = venda;
    const res = await POST(createRequest({ ...corpo, cotacaoUnitaria: 30 }));
    expect(res.status).toBe(201);
    expect(dadosDaVenda().total).toBe(120);
    expect(operacaoDasNotes()).not.toHaveProperty('unidade');
    expect(mockCaixa.creditarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 120);
  });
});
