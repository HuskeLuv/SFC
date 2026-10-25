import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    cashflowGroup: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    cashflowItem: { create: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    cashflowGroup: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  return { prisma, tx };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { personalizeGroup } from '@/utils/cashflowPersonalization';

/**
 * Orçamento v2 (PR 1): ao personalizar um grupo-template, os itens copiados levam o
 * orderIndex do template. Antes nasciam com 0 e o merge (orderIndex, nome) reordenava o
 * grupo em ordem alfabética, inclusive na ativação do v2.
 */
describe('personalizeGroup — ordem dos itens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mocks.prisma.cashflowGroup.findUnique.mockResolvedValue({
      id: 'tpl-group',
      userId: null,
      name: 'Habitação',
      type: 'despesa',
      orderIndex: 3,
      parentId: null,
      children: [],
      items: [
        { id: 'tpl-z', name: 'Zelador', significado: null, rank: null, orderIndex: 0 },
        { id: 'tpl-a', name: 'Aluguel', significado: 'casa', rank: 'essencial', orderIndex: 7 },
      ],
    });
    // Sem override por templateId nem legado por nome.
    mocks.prisma.cashflowGroup.findFirst.mockResolvedValue(null);
    mocks.tx.cashflowGroup.findFirst.mockResolvedValue(null);
    mocks.tx.cashflowGroup.create.mockResolvedValue({ id: 'user-group' });
  });

  it('copia o orderIndex de cada item-template para o override', async () => {
    await expect(personalizeGroup('tpl-group', 'user-1')).resolves.toBe('user-group');

    expect(mocks.tx.cashflowGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderIndex: 3, templateId: 'tpl-group' }),
    });
    const criados = mocks.tx.cashflowItem.create.mock.calls.map((c) => c[0].data);
    expect(criados).toEqual([
      {
        userId: 'user-1',
        groupId: 'user-group',
        name: 'Zelador',
        significado: null,
        rank: null,
        orderIndex: 0,
        templateId: 'tpl-z',
      },
      {
        userId: 'user-1',
        groupId: 'user-group',
        name: 'Aluguel',
        significado: 'casa',
        rank: 'essencial',
        orderIndex: 7,
        templateId: 'tpl-a',
      },
    ]);
  });
});
