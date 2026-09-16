import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  watchlist: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  portfolio: { findFirst: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: vi.fn(),
  invalidatePortfolioSnapshots: vi.fn(),
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: vi.fn(),
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
    action: 'planejado.editar',
    entity: 'planejado',
    entityId: 'plan-1',
    entityLabel: 'VALE3',
    changes: null,
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-09-16T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const ctx = (entry: UserChangeLog): UndoContext =>
  ({ auth, request, entry }) as unknown as UndoContext;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('planejado.adicionar (delete-created)', () => {
  const def = CARTEIRA_UNDO_HANDLERS['planejado.adicionar'];

  it('apaga o planejado criado', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue({ id: 'plan-1' });
    await def.execute(ctx(makeEntry({ action: 'planejado.adicionar', changes: [] })));
    expect(mockPrisma.watchlist.findFirst).toHaveBeenCalledWith({
      where: { id: 'plan-1', userId: 'user-1' },
    });
    expect(mockPrisma.watchlist.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
  });

  it('409 quando o planejado já sumiu (removido ou virou posição na 1ª compra)', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue(null);
    await expect(
      def.execute(ctx(makeEntry({ action: 'planejado.adicionar', changes: [] }))),
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.watchlist.delete).not.toHaveBeenCalled();
  });
});

describe('planejado.editar (restore-fields)', () => {
  const def = CARTEIRA_UNDO_HANDLERS['planejado.editar'];
  const changes = [
    { field: 'objetivo', label: 'Objetivo', before: 10, after: 20, format: 'percent' },
    { field: 'observacoes', label: 'Observações', before: null, after: 'comprar na baixa' },
  ];

  it('restaura objetivo e observações (observacoes → coluna notes)', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue({
      id: 'plan-1',
      objetivo: 20,
      secao: 'growth',
      notes: 'comprar na baixa',
    });
    const out = await def.execute(ctx(makeEntry({ changes })));
    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { objetivo: 10, notes: null },
    });
    expect(out.changes).toEqual([
      expect.objectContaining({ field: 'objetivo', before: 20, after: 10 }),
      expect.objectContaining({ field: 'observacoes', before: 'comprar na baixa', after: null }),
    ]);
  });

  it('409 quando o estado atual diverge do registrado (edição posterior)', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValue({
      id: 'plan-1',
      objetivo: 35,
      secao: 'growth',
      notes: 'comprar na baixa',
    });
    await expect(def.execute(ctx(makeEntry({ changes })))).rejects.toBeInstanceOf(UndoError);
    expect(mockPrisma.watchlist.update).not.toHaveBeenCalled();
  });
});

describe('planejado.remover (recreate-from-snapshot)', () => {
  const def = CARTEIRA_UNDO_HANDLERS['planejado.remover'];
  const snapshot = {
    v: 1,
    kind: 'planejado',
    data: {
      id: 'plan-1',
      assetId: 'asset-vale',
      objetivo: 15,
      secao: 'growth',
      notes: null,
      addedAt: '2026-09-16T10:00:00.000Z',
    },
  };
  const changes = [
    { field: 'objetivo', label: 'Objetivo', before: 15, after: null, format: 'percent' },
  ];

  it('recria o planejado com o MESMO id (mantém o LIFO por entidade)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    const out = await def.execute(
      ctx(makeEntry({ action: 'planejado.remover', snapshot, changes })),
    );
    expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
      data: {
        id: 'plan-1',
        userId: 'user-1',
        assetId: 'asset-vale',
        objetivo: 15,
        secao: 'growth',
        notes: null,
        addedAt: new Date('2026-09-16T10:00:00.000Z'),
      },
    });
    expect(out.entityLabel).toBe('VALE3');
    expect(out.changes).toEqual([expect.objectContaining({ field: 'objetivo', after: 15 })]);
  });

  it('409 quando o ativo já virou posição na carteira', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    await expect(
      def.execute(ctx(makeEntry({ action: 'planejado.remover', snapshot, changes }))),
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('409 quando o planejado já foi restaurado (violação de unicidade)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.watchlist.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      def.execute(ctx(makeEntry({ action: 'planejado.remover', snapshot, changes }))),
    ).rejects.toMatchObject({ status: 409 });
  });
});
