import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  assetCorporateAction: { findMany: vi.fn() },
}));

const mockRecalc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('../portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: mockRecalc,
}));

import { applyCorporateActionsToUserPositions } from '../applyCorporateActions';

const mockPortfolio = (overrides: Record<string, unknown> = {}) => ({
  id: 'port-1',
  userId: 'user-1',
  assetId: 'asset-1',
  asset: { id: 'asset-1', symbol: 'ITUB4' },
  ...overrides,
});

const mockAction = (overrides: Record<string, unknown> = {}) => ({
  id: 'action-1',
  date: new Date('2025-03-17T00:00:00Z'),
  type: 'BONIFICACAO',
  factor: 1.1,
  ...overrides,
});

// Compra de 100 ações em 2023, antes de qualquer evento.
const firstBuy = { date: new Date('2023-06-14T00:00:00Z'), type: 'compra', quantity: 100 };

describe('applyCorporateActionsToUserPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findMany.mockResolvedValue([mockPortfolio()]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([firstBuy]);
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([mockAction()]);
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null); // sem auditoria ainda
    mockPrisma.stockTransaction.create.mockResolvedValue({});
    mockRecalc.mockResolvedValue(undefined);
  });

  it('cria linha de auditoria de BONIFICACAO com delta e qtd antes/depois', async () => {
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result).toEqual({ scanned: 1, applied: 1, skipped: 0, errors: 0 });

    const createCall = mockPrisma.stockTransaction.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({ type: 'compra', price: 0, total: 0 });
    expect(createCall.data.quantity).toBeCloseTo(10, 6); // 110 - 100
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

  it('recomputa o portfolio (recalc é a fonte da verdade do avgPrice)', async () => {
    await applyCorporateActionsToUserPositions('user-1');
    expect(mockRecalc).toHaveBeenCalledWith({
      targetUserId: 'user-1',
      assetId: 'asset-1',
      portfolioId: 'port-1',
    });
  });

  it('DESDOBRAMENTO 2:1 gera delta +100 (100 → 200)', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ type: 'DESDOBRAMENTO', factor: 2 }),
    ]);
    await applyCorporateActionsToUserPositions('user-1');
    const notes = JSON.parse(mockPrisma.stockTransaction.create.mock.calls[0][0].data.notes);
    expect(notes.quantidadeDepois).toBeCloseTo(200, 6);
    expect(mockPrisma.stockTransaction.create.mock.calls[0][0].data.quantity).toBeCloseTo(100, 6);
  });

  it('GRUPAMENTO 1:100 gera delta negativo (100 → 1)', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ type: 'GRUPAMENTO', factor: 0.01 }),
    ]);
    await applyCorporateActionsToUserPositions('user-1');
    const notes = JSON.parse(mockPrisma.stockTransaction.create.mock.calls[0][0].data.notes);
    expect(notes.quantidadeDepois).toBeCloseTo(1, 6);
    expect(mockPrisma.stockTransaction.create.mock.calls[0][0].data.quantity).toBeCloseTo(-99, 6);
  });

  it('ignora evento anterior à primeira compra (quantityBefore = 0)', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ date: new Date('2020-01-01T00:00:00Z') }), // antes da compra de 2023
    ]);
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result).toEqual({ scanned: 1, applied: 0, skipped: 1, errors: 0 });
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('é idempotente quando já existe linha de auditoria do evento', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({ id: 'audit-existing' });
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result).toEqual({ scanned: 1, applied: 0, skipped: 1, errors: 0 });
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
    // Mesmo idempotente, recomputa pra garantir consistência.
    expect(mockRecalc).toHaveBeenCalledTimes(1);
  });

  it('pula portfolios sem assetId/symbol', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      mockPortfolio({ assetId: null, asset: null }),
    ]);
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result.scanned).toBe(0);
    expect(mockRecalc).not.toHaveBeenCalled();
  });

  it('aplica eventos em cascata (1.1 depois 1.03)', async () => {
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      mockAction({ id: 'a1', factor: 1.1, date: new Date('2025-03-17T00:00:00Z') }),
      mockAction({ id: 'a2', factor: 1.03, date: new Date('2025-12-23T00:00:00Z') }),
    ]);
    const result = await applyCorporateActionsToUserPositions('user-1');
    expect(result.applied).toBe(2);
    const n1 = JSON.parse(mockPrisma.stockTransaction.create.mock.calls[0][0].data.notes);
    const n2 = JSON.parse(mockPrisma.stockTransaction.create.mock.calls[1][0].data.notes);
    expect(n1.quantidadeDepois).toBeCloseTo(110, 4);
    expect(n2.quantidadeAntes).toBeCloseTo(110, 4);
    expect(n2.quantidadeDepois).toBeCloseTo(113.3, 4);
  });
});
