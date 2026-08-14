import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findFirst: vi.fn(), delete: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  cashflowItem: { findFirst: vi.fn(), delete: vi.fn() },
  cashflowValue: { deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));

const mockRecalc = vi.hoisted(() => vi.fn());
const mockInvalidateSnapshots = vi.hoisted(() => vi.fn());
const mockSyncSonho = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: mockRecalc,
  invalidatePortfolioSnapshots: mockInvalidateSnapshots,
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: mockSyncSonho,
}));

import { CARTEIRA_UNDO_HANDLERS } from '../handlers/carteira';
import { UndoError } from '../types';
import type { UndoContext } from '../types';

const auth = { payload: { id: 'user-1' }, targetUserId: 'user-1', actingClient: null };
const request = new NextRequest('http://localhost/api/historico-alteracoes/log-1/undo', {
  method: 'POST',
});

const makeEntry = (overrides: Partial<UserChangeLog>): UserChangeLog =>
  ({
    id: 'log-1',
    userId: 'user-1',
    actorId: 'user-1',
    viaConsultant: false,
    section: 'carteira',
    action: 'operacao.registrar',
    entity: 'operacao',
    entityId: 'tx-1',
    entityLabel: 'PETR4',
    changes: [],
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-08-14T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const ctx = (entry: UserChangeLog): UndoContext =>
  ({ auth, request, entry }) as unknown as UndoContext;

const TX_DATE = new Date('2026-08-01T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('operacao/aporte/resgate.registrar (delete-created composto)', () => {
  const acoes = ['operacao.registrar', 'aporte.registrar', 'resgate.registrar'] as const;

  it('as três ações compartilham o mesmo handler e estão registradas', () => {
    for (const acao of acoes) {
      expect(CARTEIRA_UNDO_HANDLERS[acao], acao).toBeDefined();
      expect(CARTEIRA_UNDO_HANDLERS[acao].strategy).toBe('delete-created');
    }
  });

  it('apaga a transação criada e recalcula com cutoff na DATA da transação', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: 'asset-1',
      date: TX_DATE,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1', assetId: 'asset-1' });

    await CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({})));

    expect(mockPrisma.stockTransaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
    expect(mockRecalc).toHaveBeenCalledWith({
      targetUserId: 'user-1',
      assetId: 'asset-1',
      portfolioId: 'port-1',
      recomputeSnapshotsFrom: TX_DATE,
    });
    expect(mockSyncSonho).toHaveBeenCalledWith('user-1', { assetId: 'asset-1' });
  });

  it('posição já encerrada (sem Portfolio): recalc resolve pela unique, sem portfolioId', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: 'asset-1',
      date: TX_DATE,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);

    await CARTEIRA_UNDO_HANDLERS['resgate.registrar'].execute(
      ctx(makeEntry({ action: 'resgate.registrar' })),
    );

    expect(mockRecalc).toHaveBeenCalledWith({
      targetUserId: 'user-1',
      assetId: 'asset-1',
      recomputeSnapshotsFrom: TX_DATE,
    });
  });

  it('transação sem assetId: só invalida snapshots', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: null,
      date: TX_DATE,
    });

    await CARTEIRA_UNDO_HANDLERS['aporte.registrar'].execute(
      ctx(makeEntry({ action: 'aporte.registrar' })),
    );

    expect(mockRecalc).not.toHaveBeenCalled();
    expect(mockInvalidateSnapshots).toHaveBeenCalledWith('user-1', TX_DATE);
    expect(mockSyncSonho).not.toHaveBeenCalled();
  });

  it('409 quando a transação criada não existe mais (já excluída por outro caminho)', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({}))),
    ).rejects.toThrow(UndoError);
    expect(mockPrisma.stockTransaction.delete).not.toHaveBeenCalled();
  });

  it('não desfaz transação de OUTRO user (escopo por userId no lookup)', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({}))),
    ).rejects.toThrow('A transação não existe mais');
    expect(mockPrisma.stockTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx-1', userId: 'user-1' },
    });
  });
});

describe('investimento.registrar (delete-created de item+valores do cashflow)', () => {
  const entry = () =>
    makeEntry({ action: 'investimento.registrar', entity: 'investimento', entityId: 'item-1' });

  it('apaga valores + item e invalida snapshots do mês mais antigo', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-1',
      objetivoId: null,
      dividaId: null,
      values: [
        { year: 2026, month: 7 },
        { year: 2026, month: 5 },
      ],
    });

    await CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry()));

    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1' },
    });
    expect(mockPrisma.cashflowItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    expect(mockInvalidateSnapshots).toHaveBeenCalledWith('user-1', new Date(2026, 5, 1));
  });

  it('409 para linha-espelho de sonho ou de dívida', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-1',
      objetivoId: 'sonho-1',
      dividaId: null,
      values: [],
    });
    await expect(
      CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry())),
    ).rejects.toThrow('espelha um sonho');

    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-1',
      objetivoId: null,
      dividaId: 'div-1',
      values: [],
    });
    await expect(
      CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry())),
    ).rejects.toThrow('espelha uma dívida');
  });

  it('409 quando o item não existe mais', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry())),
    ).rejects.toThrow('O investimento não existe mais');
  });
});
