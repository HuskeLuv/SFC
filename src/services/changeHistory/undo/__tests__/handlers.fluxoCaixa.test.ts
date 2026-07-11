import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  cashflowValue: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  cashflowItem: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  cashflowGroup: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  cashflow: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  planejamentoObjetivo: { findUnique: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { FLUXO_CAIXA_UNDO_HANDLERS } from '../handlers/fluxoCaixa';

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
    section: 'fluxo-caixa',
    action: 'valor.editar',
    entity: 'item',
    entityId: 'item-1',
    entityLabel: 'Salário',
    changes: null,
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
    Promise.all(ops as Promise<unknown>[]),
  );
});

describe('valor.editar — célula', () => {
  const cellEntry = (prevValue: number | null) =>
    makeEntry({
      changes: [
        { field: 'monthlyValue', label: 'Valor mensal', before: prevValue, after: 5000 },
      ] as never,
      snapshot: {
        v: 1,
        kind: 'cashflow-valor',
        data: { value: prevValue },
        meta: { itemId: 'item-1', year: 2026, month: 3 },
      } as never,
    });

  it('restaura o valor anterior da célula', async () => {
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({ id: 'val-1', value: 5000 });
    await FLUXO_CAIXA_UNDO_HANDLERS['valor.editar'].execute({
      request,
      auth,
      entry: cellEntry(3000),
    });
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledWith({
      where: { id: 'val-1' },
      data: { value: 3000 },
    });
  });

  it('célula que não existia antes → delete da row', async () => {
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({ id: 'val-1', value: 5000 });
    await FLUXO_CAIXA_UNDO_HANDLERS['valor.editar'].execute({
      request,
      auth,
      entry: cellEntry(null),
    });
    expect(mockPrisma.cashflowValue.delete).toHaveBeenCalledWith({ where: { id: 'val-1' } });
  });

  it('409 quando o valor atual difere do after', async () => {
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({ id: 'val-1', value: 9999 });
    await expect(
      FLUXO_CAIXA_UNDO_HANDLERS['valor.editar'].execute({
        request,
        auth,
        entry: cellEntry(3000),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('sem snapshot restaura campos do item (name/rank)', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Novo nome',
      rank: 'alto',
    });
    await FLUXO_CAIXA_UNDO_HANDLERS['valor.editar'].execute({
      request,
      auth,
      entry: makeEntry({
        changes: [{ field: 'name', label: 'Nome', before: 'Salário', after: 'Novo nome' }] as never,
      }),
    });
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { name: 'Salário' },
    });
  });

  it('precheck rejeita edição de célula pré-deploy (sem snapshot)', () => {
    const entry = makeEntry({
      changes: [{ field: 'monthlyValue', label: 'Valor mensal', before: 1, after: 2 }] as never,
    });
    expect(FLUXO_CAIXA_UNDO_HANDLERS['valor.editar'].precheck!(entry)).toBe(false);
  });
});

describe('item.criar (delete-created)', () => {
  it('deleta valores + item', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({ id: 'item-1', objetivoId: null });
    await FLUXO_CAIXA_UNDO_HANDLERS['item.criar'].execute({
      request,
      auth,
      entry: makeEntry({ action: 'item.criar' }),
    });
    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1' },
    });
    expect(mockPrisma.cashflowItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('409 quando o item espelha um sonho', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({ id: 'item-1', objetivoId: 'sonho-1' });
    await expect(
      FLUXO_CAIXA_UNDO_HANDLERS['item.criar'].execute({
        request,
        auth,
        entry: makeEntry({ action: 'item.criar' }),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('item.excluir (recreate-from-snapshot)', () => {
  it('tombstone → deleta a linha oculta', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({ id: 'tomb-1' });
    await FLUXO_CAIXA_UNDO_HANDLERS['item.excluir'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'item.excluir',
        snapshot: {
          v: 1,
          kind: 'cashflow-item-tombstone',
          data: {},
          meta: { tombstoneId: 'tomb-1' },
        } as never,
      }),
    });
    expect(mockPrisma.cashflowItem.delete).toHaveBeenCalledWith({ where: { id: 'tomb-1' } });
  });

  it('row apagada → recria item + valores com id original', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ id: 'group-1' });
    await FLUXO_CAIXA_UNDO_HANDLERS['item.excluir'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'item.excluir',
        snapshot: {
          v: 1,
          kind: 'cashflow-item',
          data: {
            id: 'item-1',
            groupId: 'group-1',
            name: 'Salário',
            significado: null,
            rank: null,
            templateId: null,
            hidden: false,
            objetivoId: null,
          },
          meta: {
            values: [{ year: 2026, month: 3, value: 5000, comment: null, color: null }],
          },
        } as never,
      }),
    });
    expect(mockPrisma.cashflowItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'item-1', groupId: 'group-1', name: 'Salário' }),
    });
    expect(mockPrisma.cashflowValue.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ itemId: 'item-1', year: 2026, month: 3, value: 5000 })],
    });
  });

  it('409 quando o grupo do item não existe mais', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue(null);
    await expect(
      FLUXO_CAIXA_UNDO_HANDLERS['item.excluir'].execute({
        request,
        auth,
        entry: makeEntry({
          action: 'item.excluir',
          snapshot: {
            v: 1,
            kind: 'cashflow-item',
            data: { id: 'item-1', groupId: 'group-gone' },
            meta: { values: [] },
          } as never,
        }),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('400 quando os valores foram truncados no snapshot', async () => {
    await expect(
      FLUXO_CAIXA_UNDO_HANDLERS['item.excluir'].execute({
        request,
        auth,
        entry: makeEntry({
          action: 'item.excluir',
          snapshot: {
            v: 1,
            kind: 'cashflow-item',
            data: { id: 'item-1', groupId: 'group-1' },
            meta: { values: [], valuesTruncated: true },
          } as never,
        }),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'UNDO_MISSING_DATA' });
  });
});

describe('lancamento (modelo legado)', () => {
  it('lancamento.editar restaura campos com data revivida', async () => {
    mockPrisma.cashflow.findFirst.mockResolvedValue({
      id: 'cf-1',
      valor: 400,
      data: new Date('2026-07-02T00:00:00Z'),
    });
    await FLUXO_CAIXA_UNDO_HANDLERS['lancamento.editar'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'lancamento.editar',
        entityId: 'cf-1',
        changes: [
          { field: 'valor', label: 'Valor', before: 350, after: 400 },
          {
            field: 'data',
            label: 'Data',
            before: '2026-07-01T00:00:00.000Z',
            after: '2026-07-02T00:00:00.000Z',
          },
        ] as never,
      }),
    });
    expect(mockPrisma.cashflow.update).toHaveBeenCalledWith({
      where: { id: 'cf-1' },
      data: { valor: 350, data: new Date('2026-07-01T00:00:00.000Z') },
    });
  });

  it('lancamento.excluir recria a row do snapshot', async () => {
    await FLUXO_CAIXA_UNDO_HANDLERS['lancamento.excluir'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'lancamento.excluir',
        entityId: 'cf-1',
        snapshot: {
          v: 1,
          kind: 'lancamento',
          data: {
            id: 'cf-1',
            data: '2026-07-01T00:00:00.000Z',
            tipo: 'Despesa',
            categoria: 'Alimentacao',
            descricao: 'Mercado',
            valor: 350,
            forma_pagamento: 'pix',
            pago: true,
          },
        } as never,
      }),
    });
    expect(mockPrisma.cashflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'cf-1', descricao: 'Mercado', valor: 350 }),
    });
  });
});
