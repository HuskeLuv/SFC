import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Carteira EUA em US$ (fatia FA): o recálculo grava moedaRegistro e totalInvestedBrl de ativo
 * em dólar, nunca rebaixa a unidade em caso de mistura e não toca as colunas de ação BR.
 */
const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn(), deleteMany: vi.fn() },
  fixedIncomeAsset: { deleteMany: vi.fn(), updateMany: vi.fn() },
  portfolio: { update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
  portfolioDailySnapshot: { deleteMany: vi.fn() },
  portfolioPerformance: { deleteMany: vi.fn() },
  asset: { findUnique: vi.fn(), update: vi.fn() },
  assetCorporateAction: { findMany: vi.fn() },
  assetPriceHistory: { findMany: vi.fn(), findFirst: vi.fn() },
}));
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: vi.fn() }));
vi.mock('@/services/pricing/dividendService', () => ({
  ensureCorporateActionsSynced: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshots: vi.fn(),
}));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: vi.fn() }));

import { recalculatePortfolioFromTransactions } from '../portfolioRecalculation';

const notas = (operation: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ...extra, operation });

const tx = (o: {
  type?: string;
  quantity: number;
  price: number;
  date: string;
  fees?: number;
  notes?: string | null;
}) => ({
  type: o.type ?? 'compra',
  quantity: o.quantity,
  price: o.price,
  total: o.quantity * o.price,
  date: new Date(o.date),
  fees: o.fees ?? 0,
  notes: o.notes ?? null,
});

const usd = (cotacaoMoeda: number) => notas({ unidade: 'USD', moeda: 'USD', cotacaoMoeda });

const dadosDoUpdate = () => mockPrisma.portfolio.update.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.fixedIncomeAsset.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.portfolio.update.mockResolvedValue({});
  mockPrisma.portfolio.upsert.mockResolvedValue({});
  mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
  mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
  mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);
});

describe('recalculatePortfolioFromTransactions — ativo em dólar', () => {
  it('stock em US$: totalInvestedBrl com 2 compras a câmbios diferentes + venda parcial', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      symbol: 'AAPL-1-x',
      type: 'stock',
      currency: 'USD',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      // 10 × US$ 100 a 5,00 + R$ 10 de corretagem = R$ 5.010
      tx({ quantity: 10, price: 100, date: '2026-01-10', fees: 10, notes: usd(5) }),
      // 10 × US$ 120 a 6,00 = R$ 7.200
      tx({ quantity: 10, price: 120, date: '2026-02-10', notes: usd(6) }),
      // venda de 5 (1/4 da posição): tira 1/4 do custo
      tx({ type: 'venda', quantity: 5, price: 130, date: '2026-03-10', notes: usd(5.5) }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: 'u1',
      assetId: 'a1',
      portfolioId: 'pf1',
    });

    const data = dadosDoUpdate();
    expect(data.quantity).toBe(15);
    // custo US$ = (1000 + 1200) × 3/4 = 1650 (sem corretagem)
    expect(data.totalInvested).toBeCloseTo(1650, 6);
    expect(data.avgPrice).toBeCloseTo(110, 6);
    expect(data.moedaRegistro).toBe('USD');
    // custo R$ = (5010 + 7200) × 3/4 = 9157,50
    expect(data.totalInvestedBrl).toBeCloseTo(9157.5, 2);
    expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
  });

  it('REIT sem marcador (legado em US$): câmbio de notes.cotacaoMoeda e, sem ele, da série', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      symbol: 'O-1-x',
      type: 'reit',
      currency: 'USD',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        quantity: 2,
        price: 50,
        date: '2026-01-05',
        notes: JSON.stringify({ cotacaoMoeda: 5 }),
      }),
      tx({ quantity: 1, price: 60, date: '2026-04-01', notes: null }),
    ]);
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: new Date('2026-03-30'), price: 5.5 },
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: 'u1',
      assetId: 'a1',
      portfolioId: 'pf1',
    });

    const data = dadosDoUpdate();
    expect(data.moedaRegistro).toBe('USD');
    // 100 × 5 + 60 × 5,5 (último ponto ≤ 01/04)
    expect(data.totalInvestedBrl).toBeCloseTo(830, 2);
  });

  it('compra sem câmbio nenhum: moedaRegistro USD e totalInvestedBrl vazio (aviso)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      symbol: 'O-1-x',
      type: 'reit',
      currency: 'USD',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 2, price: 50, date: '2026-01-05' }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: 'u1',
      assetId: 'a1',
      portfolioId: 'pf1',
    });

    const data = dadosDoUpdate();
    expect(data.moedaRegistro).toBe('USD');
    expect(data.totalInvestedBrl).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('mistura de unidades: loga e não toca as colunas (nunca rebaixa USD)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      symbol: 'AAPL-1-x',
      type: 'stock',
      currency: 'USD',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 10, price: 500, date: '2026-01-10' }), // legado R$ (sem marcador)
      tx({ quantity: 10, price: 100, date: '2026-02-10', notes: usd(5) }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: 'u1',
      assetId: 'a1',
      portfolioId: 'pf1',
    });

    const data = dadosDoUpdate();
    expect(data).not.toHaveProperty('moedaRegistro');
    expect(data).not.toHaveProperty('totalInvestedBrl');
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('R$ e em US$'));
  });

  it('stock legado todo em R$: colunas novas intocadas', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      symbol: 'MSFT-1-x',
      type: 'stock',
      currency: 'USD',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 10, price: 500, date: '2026-01-10', notes: notas({ unidade: 'BRL' }) }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: 'u1',
      assetId: 'a1',
      portfolioId: 'pf1',
    });

    const data = dadosDoUpdate();
    expect(data.totalInvested).toBe(5000);
    expect(data).not.toHaveProperty('moedaRegistro');
    expect(data).not.toHaveProperty('totalInvestedBrl');
  });

  it('ação BR (PETR4, currency BRL) com marcador USD por engano: sem colunas novas', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      symbol: 'PETR4',
      type: 'stock',
      currency: 'BRL',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 100, price: 30, date: '2026-01-10', notes: usd(5) }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: 'u1',
      assetId: 'a1',
      portfolioId: 'pf1',
    });

    const data = dadosDoUpdate();
    expect(data.totalInvested).toBe(3000);
    expect(data).not.toHaveProperty('moedaRegistro');
    expect(data).not.toHaveProperty('totalInvestedBrl');
    expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
  });

  it('recriação pelo upsert (sem portfolioId) também leva moedaRegistro', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      symbol: 'AAPL-1-x',
      type: 'stock',
      currency: 'USD',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 1, price: 100, date: '2026-01-10', notes: usd(5) }),
    ]);

    await recalculatePortfolioFromTransactions({ targetUserId: 'u1', assetId: 'a1' });

    const args = mockPrisma.portfolio.upsert.mock.calls[0][0];
    expect(args.create.moedaRegistro).toBe('USD');
    expect(args.update.totalInvestedBrl).toBe(500);
  });
});
