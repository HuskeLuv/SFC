import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  fixedIncomeAsset: { deleteMany: vi.fn(), updateMany: vi.fn() },
  portfolio: { update: vi.fn(), delete: vi.fn() },
  portfolioDailySnapshot: { deleteMany: vi.fn() },
  portfolioPerformance: { deleteMany: vi.fn() },
}));

const mockDeleteTtlCache = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: mockDeleteTtlCache }));

import { recalculatePortfolioFromTransactions } from '../portfolioRecalculation';

const userId = 'user-1';
const portfolioId = 'pf-1';

const tx = (
  overrides: Partial<{ type: string; quantity: number; price: number; total: number }> = {},
) => ({
  type: 'compra',
  quantity: 10,
  price: 30,
  total: 300,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([tx()]);
  mockPrisma.fixedIncomeAsset.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.fixedIncomeAsset.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.portfolio.update.mockResolvedValue({});
  mockPrisma.portfolio.delete.mockResolvedValue({});
  mockPrisma.portfolioDailySnapshot.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.portfolioPerformance.deleteMany.mockResolvedValue({ count: 0 });
});

describe('recalculatePortfolioFromTransactions', () => {
  it('recomputa quantidade e preço médio sobre todas as transações', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 10, price: 20, total: 200 }),
      tx({ quantity: 10, price: 30, total: 300 }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      stockId: null,
      portfolioId,
    });

    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: portfolioId },
      data: expect.objectContaining({
        quantity: 20,
        avgPrice: 25,
        totalInvested: 500,
      }),
    });
  });

  it('venda remove custo proporcional (não a receita)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ type: 'compra', quantity: 10, price: 20, total: 200 }),
      tx({ type: 'venda', quantity: 5, price: 40, total: 200 }), // vende metade
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      stockId: null,
      portfolioId,
    });

    const updateCall = mockPrisma.portfolio.update.mock.calls[0]?.[0];
    expect(updateCall?.data.quantity).toBe(5);
    expect(updateCall?.data.avgPrice).toBe(20); // preserva avg, não usa preço de venda
    expect(updateCall?.data.totalInvested).toBe(100);
  });

  it('deleta Portfolio + FixedIncomeAsset quando todas as transações somem', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      stockId: null,
      portfolioId,
    });

    expect(mockPrisma.fixedIncomeAsset.deleteMany).toHaveBeenCalledWith({
      where: { userId, assetId: 'asset-1' },
    });
    expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({ where: { id: portfolioId } });
  });

  // Bug #02: invalidação de snapshots/cache na edição
  describe('Bug #02 — invalidação de snapshots após edição', () => {
    it('não toca em snapshots quando recomputeSnapshotsFrom não é passado', async () => {
      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
      });

      expect(mockPrisma.portfolioDailySnapshot.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.portfolioPerformance.deleteMany).not.toHaveBeenCalled();
      expect(mockDeleteTtlCache).not.toHaveBeenCalled();
    });

    it('apaga snapshots e performance >= cutoff quando recomputeSnapshotsFrom passa', async () => {
      const cutoff = new Date('2025-06-15T14:00:00Z');

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
        recomputeSnapshotsFrom: cutoff,
      });

      expect(mockPrisma.portfolioDailySnapshot.deleteMany).toHaveBeenCalledWith({
        where: { userId, date: { gte: expect.any(Date) } },
      });
      expect(mockPrisma.portfolioPerformance.deleteMany).toHaveBeenCalledWith({
        where: { userId, date: { gte: expect.any(Date) } },
      });
      // cutoff é normalizado para UTC midnight do dia da edição
      const snapshotArg = mockPrisma.portfolioDailySnapshot.deleteMany.mock.calls[0]?.[0];
      const gteDate = snapshotArg?.where?.date?.gte as Date;
      expect(gteDate.getUTCHours()).toBe(0);
      expect(gteDate.getUTCMinutes()).toBe(0);
      expect(gteDate.toISOString().slice(0, 10)).toBe('2025-06-15');
    });

    it('invalida cache TTL carteiraResumo do usuário', async () => {
      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
        recomputeSnapshotsFrom: new Date('2025-06-15'),
      });

      expect(mockDeleteTtlCache).toHaveBeenCalledWith('carteiraResumo', `${userId}:`);
    });

    it('invalida snapshots mesmo quando carteira esvazia (todas transações removidas)', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
        recomputeSnapshotsFrom: new Date('2025-06-15'),
      });

      expect(mockPrisma.portfolioDailySnapshot.deleteMany).toHaveBeenCalled();
      expect(mockDeleteTtlCache).toHaveBeenCalledWith('carteiraResumo', `${userId}:`);
    });
  });
});
