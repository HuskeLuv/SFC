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
    deleteMany: vi.fn(),
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
const mockRecomputeEvolucao = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: mockRecomputeEvolucao,
}));

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

describe('fluxo.importar-planilha — desfazer importação', () => {
  const importEntry = () =>
    makeEntry({
      action: 'fluxo.importar-planilha',
      entity: 'importacao',
      entityId: null,
      entityLabel: 'a planilha "flc.xlsx" (2026): 3 células, 1 itens novos, 0 comentários',
      snapshot: {
        v: 1,
        kind: 'fluxo-import',
        data: {
          ano: 2026,
          itensCriados: [{ id: 'item-novo', nome: 'Streaming' }],
          metadados: [{ itemId: 'item-2', significadoAntes: null, significadoDepois: 'Moradia' }],
          valores: [
            // célula que existia antes (100) e o import gravou 250
            {
              itemId: 'item-1',
              month: 0,
              antes: { value: 100, comment: null, color: null },
              depois: { value: 250, comment: null, color: null },
            },
            // célula criada pelo import (não existia)
            {
              itemId: 'item-1',
              month: 1,
              antes: null,
              depois: { value: 300, comment: 'obs', color: null },
            },
            // célula editada DEPOIS do import (atual ≠ depois) → mantida
            {
              itemId: 'item-1',
              month: 2,
              antes: { value: 50, comment: null, color: null },
              depois: { value: 999, comment: null, color: null },
            },
          ],
        },
        meta: { ano: 2026, arquivo: 'flc.xlsx' },
      } as never,
    });

  it('restaura células, remove itens criados, devolve metadados e recomputa evolução', async () => {
    // estado atual: mês 0 e 1 intactos do import; mês 2 editado pelo usuário (777)
    mockPrisma.cashflowValue.findFirst.mockImplementation(
      ({ where }: { where: { month: number } }) => {
        if (where.month === 0)
          return Promise.resolve({ id: 'v0', value: 250, comment: null, color: null, month: 0 });
        if (where.month === 1)
          return Promise.resolve({ id: 'v1', value: 300, comment: 'obs', color: null, month: 1 });
        return Promise.resolve({ id: 'v2', value: 777, comment: null, color: null, month: 2 });
      },
    );
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-2',
      significado: 'Moradia',
      rank: null,
    });
    mockPrisma.cashflowValue.update.mockResolvedValue({});
    mockPrisma.cashflowValue.delete.mockResolvedValue({});
    mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.cashflowItem.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.cashflowItem.update.mockResolvedValue({});

    const outcome = await FLUXO_CAIXA_UNDO_HANDLERS['fluxo.importar-planilha'].execute({
      request,
      auth,
      entry: importEntry(),
    });

    // mês 0: volta pro valor anterior
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v0' },
        data: { value: 100, comment: null, color: null },
      }),
    );
    // mês 1: não existia antes → remove a row
    expect(mockPrisma.cashflowValue.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    // mês 2: editado depois → intocado (nenhum update/delete no v2)
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.cashflowValue.delete).toHaveBeenCalledTimes(1);
    // metadados: significado volta ao anterior (vazio)
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'item-2' }, data: { significado: null } }),
    );
    // itens criados pelo import: células + item removidos
    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: { in: ['item-novo'] }, userId: 'user-1' },
    });
    expect(mockPrisma.cashflowItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-novo'] }, userId: 'user-1' },
    });
    // efeito colateral espelhado do commit
    expect(mockRecomputeEvolucao).toHaveBeenCalledWith('user-1', new Date(Date.UTC(2026, 0, 1)));
    expect(outcome.entityLabel).toContain('2 células restauradas');
    expect(outcome.entityLabel).toContain('1 itens removidos');
    expect(outcome.entityLabel).toContain('1 células mantidas');
  });

  it('rejeita snapshot de kind incompatível', async () => {
    await expect(
      FLUXO_CAIXA_UNDO_HANDLERS['fluxo.importar-planilha'].execute({
        request,
        auth,
        entry: makeEntry({
          action: 'fluxo.importar-planilha',
          snapshot: { v: 1, kind: 'outra-coisa', data: {} } as never,
        }),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'UNDO_MISSING_DATA' });
  });
});
