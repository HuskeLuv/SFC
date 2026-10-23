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
  // Série USD-BRL (fallback do câmbio das operações sem cotação gravada).
  assetPriceHistory: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

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
  /** Asset.currency (default 'USD'). */
  currency?: string;
  /** notes.operation.unidade; ausente = sem marcador (stock legado em R$, REIT em US$). */
  unidade?: 'USD' | 'BRL';
}) => ({
  type: overrides.type,
  date: overrides.date,
  quantity: overrides.quantity,
  price: overrides.price,
  fees: overrides.fees ?? 0,
  asset: {
    symbol: overrides.symbol,
    type: overrides.assetType,
    currency: overrides.currency ?? 'USD',
  },
  notes: JSON.stringify({
    operation: {
      moeda: overrides.moeda ?? 'USD',
      cotacaoMoeda: overrides.cotacaoMoeda,
      ...(overrides.unidade ? { unidade: overrides.unidade } : {}),
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
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
  });

  it('retorna apuracao vazia quando não há transações em USD', async () => {
    const response = await GET(createRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.meses).toEqual([]);
  });

  it('inclui Stocks US em US$ (marcador unidade USD) com cotacaoMoeda na apuração', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'VOO',
        assetType: 'stock',
        quantity: 10,
        price: 500,
        cotacaoMoeda: 5,
        unidade: 'USD',
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'VOO',
        assetType: 'stock',
        quantity: 10,
        price: 600,
        cotacaoMoeda: 5,
        unidade: 'USD',
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

  it('PETR4 (stock BRL) nunca entra, mesmo com cotacaoMoeda nas notes', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'PETR4',
        assetType: 'stock',
        currency: 'BRL',
        quantity: 1000,
        price: 30,
        cotacaoMoeda: 5,
        unidade: 'USD',
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'PETR4',
        assetType: 'stock',
        currency: 'BRL',
        quantity: 1000,
        price: 60,
        cotacaoMoeda: 5,
        unidade: 'USD',
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.meses).toEqual([]);
    // Sem ativo em dólar, nem carrega a série.
    expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
  });

  it('stock legado em R$ (sem marcador): sem dupla conversão', async () => {
    // Compra 10 × R$ 500 (fx 5) e venda 10 × R$ 600 (fx 6), gravadas em R$.
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'AAPL-1700000000000-abc',
        assetType: 'stock',
        quantity: 10,
        price: 500,
        cotacaoMoeda: 5,
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'AAPL-1700000000000-abc',
        assetType: 'stock',
        quantity: 10,
        price: 600,
        cotacaoMoeda: 6,
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    // R$ 6.000 − R$ 5.000 = R$ 1.000 (e não 600 × 6 × 10 − 500 × 5 × 10).
    expect(feb.vendasTotalBrl).toBe(6000);
    expect(feb.lucroBrutoBrl).toBe(1000);
    expect(feb.cambioAproximado).toBe(false);
  });

  it('venda sem cotação usa o câmbio de mercado da data (aproximado) e gera ganho', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: new Date('2025-01-02'), price: 5 },
      { date: new Date('2025-02-10'), price: 5.5 },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      buildTx({
        type: 'compra',
        date: new Date('2025-01-15'),
        symbol: 'O-1700000000000-abc',
        assetType: 'reit',
        quantity: 100,
        price: 50,
        cotacaoMoeda: 5,
      }),
      buildTx({
        type: 'venda',
        date: new Date('2025-02-15'),
        symbol: 'O-1700000000000-abc',
        assetType: 'reit',
        quantity: 100,
        price: 50,
        cotacaoMoeda: null,
      }),
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    const feb = data.meses.find((m: { yearMonth: string }) => m.yearMonth === '2025-02');
    // Mesmo preço US$, câmbio 5 → 5,5 (última taxa ≤ 15/02): ganho cambial de R$ 2.500.
    expect(feb.lucroBrutoBrl).toBe(2500);
    expect(feb.cambioAproximado).toBe(true);
    expect(data.operacoesCambioAproximado).toBe(1);
    expect(data.rotuloCambioAproximado).toBe('câmbio de mercado (aproximado)');
    expect(data.aviso).toMatch(/Lei 14\.754/);
  });

  it('ignora transações sem cotacaoMoeda e sem série de câmbio', async () => {
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
    expect(data.operacoesSemCambio).toBe(1);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });
});
