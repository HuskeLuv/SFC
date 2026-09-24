import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: { findFirst: vi.fn() },
  cashflowItem: { findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);
const mockPersonalizeItem = vi.hoisted(() => vi.fn());
const mockPersonalizeGroup = vi.hoisted(() => vi.fn());
const mockGetStructure = vi.hoisted(() => vi.fn());
const mockRecordChange = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/cashflowPersonalization', () => ({
  personalizeItem: mockPersonalizeItem,
  personalizeGroup: mockPersonalizeGroup,
}));
vi.mock('@/utils/cashflowSetup', () => ({ getUserCashflowStructure: mockGetStructure }));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...original, recordChange: mockRecordChange };
});

import { POST } from '../route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/cashflow/item/move', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

// Árvore mesclada: Habitação (template, com Internet template) e Lazer
// (override do usuário, com Cinema dele); Aporte/Resgate é calculado.
const tree = () => [
  {
    id: 'despesas',
    name: 'Despesas',
    type: 'despesa',
    userId: null,
    items: [],
    children: [
      {
        id: 'tpl-hab',
        name: 'Habitação',
        type: 'despesa',
        userId: null,
        items: [
          { id: 'tpl-aluguel', userId: null },
          { id: 'tpl-internet', userId: null },
        ],
        children: [],
      },
      {
        id: 'user-lazer',
        name: 'Lazer',
        type: 'despesa',
        userId: 'user-1',
        items: [{ id: 'user-cinema', userId: 'user-1' }],
        children: [],
      },
    ],
  },
  { id: 'inv', name: 'Investimentos', type: 'investimento', userId: null, items: [], children: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStructure.mockResolvedValue(tree());
  mockRecordChange.mockResolvedValue(undefined);
  mockPrisma.cashflowItem.update.mockResolvedValue({});
  mockPrisma.cashflowItem.findFirst.mockResolvedValue({
    id: 'tpl-internet',
    userId: null,
    name: 'Internet',
    objetivoId: null,
    dividaId: null,
  });
  mockPersonalizeItem.mockResolvedValue('user-internet');
});

describe('POST /api/cashflow/item/move', () => {
  it('personaliza o template, troca o grupo e grava a ordem do destino', async () => {
    const res = await POST(
      req({
        itemId: 'tpl-internet',
        toGroupId: 'user-lazer',
        itemIds: ['tpl-internet', 'user-cinema'],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      itemId: 'user-internet',
      groupId: 'user-lazer',
      itemIds: ['user-internet', 'user-cinema'],
    });

    expect(mockPersonalizeItem).toHaveBeenCalledWith('tpl-internet', 'user-1');
    expect(mockPersonalizeGroup).not.toHaveBeenCalled(); // destino já é do usuário
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'user-internet' },
      data: { groupId: 'user-lazer' },
    });
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'user-internet' },
      data: { orderIndex: 1 },
    });
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'user-cinema' },
      data: { orderIndex: 2 },
    });
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'item.mover',
        entityLabel: 'Internet',
        changes: [expect.objectContaining({ before: 'Habitação', after: 'Lazer' })],
      }),
    );
  });

  it('destino template é personalizado e os ids dele resolvidos pro override', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'user-cinema',
      userId: 'user-1',
      name: 'Cinema',
      objetivoId: null,
      dividaId: null,
    });
    mockPersonalizeGroup.mockResolvedValue('user-hab');
    mockPersonalizeItem.mockImplementation(async (id: string) => `ovr-${id}`);

    const res = await POST(
      req({
        itemId: 'user-cinema',
        toGroupId: 'tpl-hab',
        itemIds: ['tpl-aluguel', 'user-cinema', 'tpl-internet'],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPersonalizeGroup).toHaveBeenCalledWith('tpl-hab', 'user-1');
    expect((await res.json()).itemIds).toEqual([
      'ovr-tpl-aluguel',
      'user-cinema',
      'ovr-tpl-internet',
    ]);
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'user-cinema' },
      data: { groupId: 'user-hab' },
    });
  });

  it('400 quando o destino é o próprio grupo', async () => {
    const res = await POST(
      req({
        itemId: 'tpl-internet',
        toGroupId: 'tpl-hab',
        itemIds: ['tpl-internet', 'tpl-aluguel'],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('400 quando o destino é um grupo calculado', async () => {
    const res = await POST(
      req({ itemId: 'tpl-internet', toGroupId: 'inv', itemIds: ['tpl-internet'] }),
    );
    expect(res.status).toBe(400);
  });

  it('400 para linha vinculada a sonho ou dívida', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'tpl-internet',
      userId: 'user-1',
      name: 'Carro',
      objetivoId: null,
      dividaId: 'div-1',
    });
    const res = await POST(
      req({
        itemId: 'tpl-internet',
        toGroupId: 'user-lazer',
        itemIds: ['tpl-internet', 'user-cinema'],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPersonalizeItem).not.toHaveBeenCalled();
  });

  it('400 quando a lista do destino não bate com as linhas dele', async () => {
    const res = await POST(
      req({
        itemId: 'tpl-internet',
        toGroupId: 'user-lazer',
        itemIds: ['tpl-internet', 'tpl-aluguel'],
      }),
    );
    expect(res.status).toBe(400);
    const faltando = await POST(
      req({ itemId: 'tpl-internet', toGroupId: 'user-lazer', itemIds: ['tpl-internet'] }),
    );
    expect(faltando.status).toBe(400);
  });

  it('404 quando a linha não está na árvore do usuário', async () => {
    const res = await POST(
      req({ itemId: 'de-outro', toGroupId: 'user-lazer', itemIds: ['de-outro', 'user-cinema'] }),
    );
    expect(res.status).toBe(404);
  });

  it('cópia antiga (sem templateId) é vinculada ao template antes de sair do grupo', async () => {
    mockPrisma.cashflowItem.findFirst
      .mockResolvedValueOnce({
        id: 'user-cinema',
        userId: 'user-1',
        name: 'Cinema',
        groupId: 'user-lazer',
        templateId: null,
        objetivoId: null,
        dividaId: null,
      })
      .mockResolvedValueOnce({ id: 'tpl-cinema' }) // item do template com o mesmo nome
      .mockResolvedValueOnce(null); // nenhum override explícito ainda
    mockPrisma.cashflowGroup.findFirst.mockResolvedValue({ templateId: 'tpl-lazer' });
    mockPersonalizeGroup.mockResolvedValue('user-hab');
    mockPersonalizeItem.mockImplementation(async (id: string) => `ovr-${id}`);

    const res = await POST(
      req({
        itemId: 'user-cinema',
        toGroupId: 'tpl-hab',
        itemIds: ['tpl-aluguel', 'tpl-internet', 'user-cinema'],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'user-cinema' },
      data: { templateId: 'tpl-cinema' },
    });
  });
});
