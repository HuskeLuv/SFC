import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: { findFirst: vi.fn(), findUnique: vi.fn() },
  cashflowGroup: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  getItemForUser,
  getGroupForUser,
  resolveOwnedGroupId,
} from '@/utils/cashflowPersonalization';

/**
 * Auditoria de segurança 29/08/2026 (achado 3.2): o passo 3 ("template
 * original") devolvia item/grupo de QUALQUER usuário via findUnique por id,
 * abrindo IDOR de escrita no batch-update e injeção de linhas na árvore de
 * terceiros. Aqui garantimos que só templates (userId = null) passam.
 */
describe('cashflowPersonalization — isolamento por usuário', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getItemForUser: item de outro usuário NÃO é devolvido como template', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue(null);

    const result = await getItemForUser('item-of-user-B', 'user-A');

    expect(result).toBeNull();
    expect(mockPrisma.cashflowItem.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowItem.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'item-of-user-B', userId: null },
    });
  });

  it('getItemForUser: template (userId null) continua resolvido', async () => {
    const tpl = { id: 'tpl-1', userId: null };
    mockPrisma.cashflowItem.findFirst
      .mockResolvedValueOnce(null) // próprio
      .mockResolvedValueOnce(null) // override por templateId
      .mockResolvedValueOnce(tpl); // template

    await expect(getItemForUser('tpl-1', 'user-A')).resolves.toEqual(tpl);
  });

  it('getGroupForUser: grupo de outro usuário NÃO é devolvido', async () => {
    mockPrisma.cashflowGroup.findFirst.mockResolvedValue(null);

    await expect(getGroupForUser('group-of-user-B', 'user-A')).resolves.toBeNull();
    expect(mockPrisma.cashflowGroup.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowGroup.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'group-of-user-B', userId: null },
    });
  });

  it('resolveOwnedGroupId: grupo próprio → o próprio id; alheio → null', async () => {
    mockPrisma.cashflowGroup.findFirst.mockResolvedValueOnce({ id: 'g-own', userId: 'user-A' });
    await expect(resolveOwnedGroupId('g-own', 'user-A')).resolves.toBe('g-own');

    mockPrisma.cashflowGroup.findFirst.mockResolvedValue(null);
    await expect(resolveOwnedGroupId('g-other', 'user-A')).resolves.toBeNull();
  });
});
