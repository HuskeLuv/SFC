import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from '../route';

const mockPrisma = vi.hoisted(() => ({
  userChangeLog: { create: vi.fn() },
  portfolio: { findFirst: vi.fn(), delete: vi.fn() },
  stockTransaction: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

const mockInvalidatePortfolioSnapshots = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  invalidatePortfolioSnapshots: mockInvalidatePortfolioSnapshots,
}));

const mockRecordChange = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...original, recordChange: mockRecordChange };
});

const createRequest = () =>
  new NextRequest('http://localhost/api/ativos/port-1/portfolio', { method: 'DELETE' });

const callDelete = () => DELETE(createRequest(), { params: Promise.resolve({ id: 'port-1' }) });

const mockPortfolio = {
  id: 'port-1',
  userId: 'user-123',
  assetId: 'asset-rf',
  quantity: 1,
  avgPrice: 20000,
  totalInvested: 20000,
  asset: { symbol: 'RENDA-FIXA-1', name: 'CDB Teste', source: 'manual' },
};

const mockFixedIncome = {
  id: 'fi-1',
  userId: 'user-123',
  assetId: 'asset-rf',
  type: 'CDB_PRE',
  description: 'CDB Teste 110% CDI',
  startDate: new Date('2026-01-15'),
  maturityDate: new Date('2028-01-15'),
  investedAmount: 20000,
  annualRate: 110,
  indexer: 'CDI',
  indexerPercent: 100,
  liquidityType: null,
  taxExempt: false,
  tesouroBondType: null,
  tesouroMaturity: null,
};

describe('DELETE /api/ativos/[id]/portfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolio);
    mockPrisma.portfolio.delete.mockResolvedValue(mockPortfolio);
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({ date: new Date('2026-02-01') });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        assetId: 'asset-rf',
        type: 'compra',
        quantity: 1,
        price: 20000,
        total: 20000,
        date: new Date('2026-02-01'),
        fees: 0,
        notes: null,
      },
    ]);
    mockPrisma.stockTransaction.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(mockFixedIncome);
    mockPrisma.fixedIncomeAsset.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('apaga o FixedIncomeAsset junto com transações e portfolio', async () => {
    const response = await callDelete();
    expect(response.status).toBe(200);
    expect(mockPrisma.fixedIncomeAsset.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123', assetId: 'asset-rf' },
    });
    expect(mockPrisma.stockTransaction.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({ where: { id: 'port-1' } });
  });

  it('inclui o FixedIncomeAsset no snapshot de undo', async () => {
    await callDelete();
    expect(mockRecordChange).toHaveBeenCalledTimes(1);
    const snapshot = mockRecordChange.mock.calls[0][0].snapshot;
    expect(snapshot?.kind).toBe('ativo-completo');
    expect(snapshot?.data?.fixedIncome).toMatchObject({
      type: 'CDB_PRE',
      description: 'CDB Teste 110% CDI',
      investedAmount: 20000,
    });
  });

  it('usa o startDate do FI como cutoff quando anterior à primeira transação', async () => {
    await callDelete();
    expect(mockInvalidatePortfolioSnapshots).toHaveBeenCalledWith(
      'user-123',
      new Date('2026-01-15'),
    );
  });

  it('invalida a partir do startDate do FI mesmo sem transações', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    await callDelete();
    expect(mockInvalidatePortfolioSnapshots).toHaveBeenCalledWith(
      'user-123',
      new Date('2026-01-15'),
    );
  });

  it('funciona sem FixedIncomeAsset (ativo comum): snapshot sem FI, cutoff pela transação', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
    const response = await callDelete();
    expect(response.status).toBe(200);
    const snapshot = mockRecordChange.mock.calls[0][0].snapshot;
    expect(snapshot?.data?.fixedIncome).toBeUndefined();
    expect(mockInvalidatePortfolioSnapshots).toHaveBeenCalledWith(
      'user-123',
      new Date('2026-02-01'),
    );
  });

  it('retorna 404 quando portfolio não pertence ao usuário', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    const response = await callDelete();
    expect(response.status).toBe(404);
    expect(mockPrisma.fixedIncomeAsset.deleteMany).not.toHaveBeenCalled();
  });
});
