import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  stockTransaction: { findFirst: vi.fn(), create: vi.fn() },
  assetCorporateAction: { findMany: vi.fn() },
  $transaction: vi.fn((ops) => Promise.all(ops)),
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

import { applyCorporateActionsToUserPositions } from '../applyCorporateActions';

const mockPortfolio = (overrides: Record<string, unknown> = {}) => ({
  id: 'port-1',
  userId: 'user-1',
  assetId: 'asset-1',
  quantity: 100,
  totalInvested: 1000,
  avgPrice: 10,
  asset: { id: 'asset-1', symbol: 'ITUB4' },
  ...overrides,
});

const mockAction = (overrides: Record<string, unknown> = {}) => ({
  id: 'action-1',
  symbol: 'ITUB4',
  date: new Date('2025-03-17T00:00:00Z'),
  type: 'BONIFICACAO',
  factor: 1.1,
  completeFactor: '1,1 para 1',
  ...overrides,
});

describe('applyCorporateActionsToUserPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findMany.mockResolvedValue([mockPortfolio()]);
    mockPrisma.stockTransaction.findFirst.mockImplementation(
      (args: { where: { notes?: unknown } }) => {
        // first buy lookup
        if (args.where.notes && typeof args.where.notes === 'object' && 'not' in args.where.notes) {
          return Promise.resolve({ date: new Date('2023-06-14T00:00:00Z') });
        }
        // idempotency lookup
        return Promise.resolve(null);
      },
    );
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([mockAction()]);
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      quantity: 100,
      totalInvested: 1000,
      avgPrice: 10,
    });
    mockPrisma.portfolio.update.mockResolvedValue({});
    mockPrisma.stockTransaction.create.mockResolvedValue({});
  });

  it('aplica BONIFICACAO factor 1.1 multiplicando quantidade', async () => {
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result).toEqual({ scanned: 1, applied: 1, skipped: 0, errors: 0 });
    const updateCall = mockPrisma.portfolio.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'port-1' });
    expect(updateCall.data.quantity).toBeCloseTo(110, 6);
    expect(updateCall.data.avgPrice).toBeCloseTo(1000 / 110, 6);
  });

  it('cria StockTransaction de ajuste com corporateActionId no notes', async () => {
    await applyCorporateActionsToUserPositions('user-1');
    const createCall = mockPrisma.stockTransaction.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      type: 'compra',
      price: 0,
      total: 0,
    });
    expect(createCall.data.quantity).toBeCloseTo(10, 6);
    const notes = JSON.parse(createCall.data.notes);
    expect(notes).toMatchObject({
      operation: { action: 'ajuste-corporativo' },
      corporateActionId: 'action-1',
      corporateActionType: 'BONIFICACAO',
      factor: 1.1,
      quantidadeAntes: 100,
    });
    expect(notes.quantidadeDepois).toBeCloseTo(110, 6);
  });

  it('aplica DESDOBRAMENTO factor 2 (split 2:1) dobrando quantidade', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ type: 'DESDOBRAMENTO', factor: 2 }),
    ]);
    await applyCorporateActionsToUserPositions('user-1');
    const u = mockPrisma.portfolio.update.mock.calls[0][0];
    expect(u.data.quantity).toBeCloseTo(200, 6);
    expect(u.data.avgPrice).toBeCloseTo(5, 6);
  });

  it('aplica GRUPAMENTO factor 0.01 (1 para 100) reduzindo quantidade', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ type: 'GRUPAMENTO', factor: 0.01 }),
    ]);
    await applyCorporateActionsToUserPositions('user-1');
    const u = mockPrisma.portfolio.update.mock.calls[0][0];
    expect(u.data.quantity).toBeCloseTo(1, 6);
    expect(u.data.avgPrice).toBeCloseTo(1000, 6);
  });

  it('totalInvested permanece o mesmo após split/bonus (só qty e avgPrice mudam)', async () => {
    await applyCorporateActionsToUserPositions('user-1');
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: 'port-1' },
      data: expect.not.objectContaining({ totalInvested: expect.anything() }),
    });
  });

  it('pula tipo não-suportado (CIS RED CAP) sem aplicar', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ type: 'CIS RED CAP', factor: 100 }),
    ]);
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result).toEqual({ scanned: 1, applied: 0, skipped: 1, errors: 0 });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('é idempotente quando já existe tx com corporateActionId no notes', async () => {
    mockPrisma.stockTransaction.findFirst.mockImplementation(
      (args: { where: { notes?: unknown } }) => {
        // first buy
        if (args.where.notes && typeof args.where.notes === 'object' && 'not' in args.where.notes) {
          return Promise.resolve({ date: new Date('2023-06-14T00:00:00Z') });
        }
        // idempotency: já existe
        return Promise.resolve({ id: 'tx-existing' });
      },
    );
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result).toEqual({ scanned: 1, applied: 0, skipped: 1, errors: 0 });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('pula portfolios sem assetId ou sem primeira compra', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      mockPortfolio({ assetId: null, asset: null }),
    ]);
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result.scanned).toBe(0);
  });

  it('aplica ações em cascata (qty atualizada serve de base pra próxima)', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ id: 'a1', factor: 1.1, date: new Date('2025-03-17Z') }),
      mockAction({ id: 'a2', factor: 1.03, date: new Date('2025-12-23Z') }),
    ]);
    // Primeira chamada findUnique retorna qty=100, segunda retorna qty=110
    let callCount = 0;
    mockPrisma.portfolio.findUnique.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ quantity: 100, totalInvested: 1000, avgPrice: 10 });
      }
      return Promise.resolve({
        quantity: 110,
        totalInvested: 1000,
        avgPrice: 1000 / 110,
      });
    });
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result.applied).toBe(2);
    const calls = mockPrisma.portfolio.update.mock.calls;
    expect(calls[0][0].data.quantity).toBeCloseTo(110, 4);
    expect(calls[1][0].data.quantity).toBeCloseTo(113.3, 4);
  });
});
