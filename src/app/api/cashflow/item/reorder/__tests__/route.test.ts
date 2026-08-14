import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: { findFirst: vi.fn(), findMany: vi.fn() },
  cashflowItem: { findMany: vi.fn(), update: vi.fn() },
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
const mockRecordChange = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/cashflowPersonalization', () => ({ personalizeItem: mockPersonalizeItem }));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...original, recordChange: mockRecordChange };
});

import { POST } from '../route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/cashflow/item/reorder', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockRecordChange.mockResolvedValue(undefined);
  mockPrisma.cashflowGroup.findFirst.mockResolvedValue({
    id: 'grp-1',
    name: 'Habitação',
    userId: null,
    templateId: null,
  });
  mockPrisma.cashflowGroup.findMany.mockResolvedValue([{ id: 'grp-1' }, { id: 'grp-user' }]);
  mockPrisma.cashflowItem.update.mockResolvedValue({});
});

describe('POST /api/cashflow/item/reorder', () => {
  it('grava orderIndex pela posição, personalizando itens de template', async () => {
    mockPrisma.cashflowItem.findMany.mockResolvedValue([
      { id: 'tpl-a', userId: null, groupId: 'grp-1', name: 'Aluguel' },
      { id: 'user-b', userId: 'user-1', groupId: 'grp-user', name: 'Internet' },
    ]);
    mockPersonalizeItem.mockResolvedValue('override-a');

    const res = await POST(req({ groupId: 'grp-1', itemIds: ['user-b', 'tpl-a'] }));
    expect(res.status).toBe(200);

    // template personalizado antes de gravar posição
    expect(mockPersonalizeItem).toHaveBeenCalledWith('tpl-a', 'user-1');
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'user-b' },
      data: { orderIndex: 1 },
    });
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'override-a' },
      data: { orderIndex: 2 },
    });
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'itens.reordenar', entityLabel: 'Habitação' }),
    );
  });

  it('400 quando um item não pertence ao grupo (nem às camadas dele)', async () => {
    mockPrisma.cashflowItem.findMany.mockResolvedValue([
      { id: 'a', userId: 'user-1', groupId: 'OUTRO-grupo', name: 'X' },
      { id: 'b', userId: 'user-1', groupId: 'grp-user', name: 'Y' },
    ]);

    const res = await POST(req({ groupId: 'grp-1', itemIds: ['a', 'b'] }));
    expect(res.status).toBe(400);
    expect(mockPrisma.cashflowItem.update).not.toHaveBeenCalled();
  });

  it('404 para grupo inexistente/de outro usuário', async () => {
    mockPrisma.cashflowGroup.findFirst.mockResolvedValue(null);
    const res = await POST(req({ groupId: 'x', itemIds: ['a', 'b'] }));
    expect(res.status).toBe(404);
  });

  it('400 para payload inválido (menos de 2 itens)', async () => {
    const res = await POST(req({ groupId: 'grp-1', itemIds: ['a'] }));
    expect(res.status).toBe(400);
  });
});
