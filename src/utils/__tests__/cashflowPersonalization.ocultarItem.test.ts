import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => {
  const cliente = () => ({
    user: { findUnique: vi.fn() },
    cashflowItem: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    cashflowGroup: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  });
  return { prisma: cliente(), tx: cliente() };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { hideTemplateItem, ocultarItemTemplateTx } from '@/utils/cashflowPersonalization';

const tx = mocks.tx as unknown as Prisma.TransactionClient;
const TEMPLATE_ITEM = {
  id: 'tpl-item',
  userId: null,
  groupId: 'tpl-group',
  name: 'Internet',
  significado: null,
  rank: null,
};

/**
 * Orçamento v2 (PR 1): `ocultarItemTemplateTx` é o núcleo de `hideTemplateItem` que roda na
 * transação da exclusão com fusão. `hideTemplateItem` delega para ela sem mudar o efeito.
 */
describe('ocultarItemTemplateTx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa só o cliente recebido e oculta o override existente', async () => {
    mocks.tx.cashflowItem.findUnique.mockResolvedValue(TEMPLATE_ITEM);
    mocks.tx.cashflowItem.findFirst.mockResolvedValue({ id: 'user-item', hidden: false });

    await expect(ocultarItemTemplateTx(tx, 'tpl-item', 'user-1')).resolves.toBe('user-item');

    expect(mocks.tx.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'user-item' },
      data: { hidden: true },
    });
    expect(mocks.prisma.cashflowItem.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.cashflowItem.update).not.toHaveBeenCalled();
  });

  it('recusa o id de um override (precisa do id do template)', async () => {
    mocks.tx.cashflowItem.findUnique.mockResolvedValue({ ...TEMPLATE_ITEM, userId: 'user-1' });

    await expect(ocultarItemTemplateTx(tx, 'user-item', 'user-1')).rejects.toThrow(
      'Item não é um template',
    );
  });

  it('sem resolvedor, cria o tombstone no override do grupo que já existe', async () => {
    mocks.tx.cashflowItem.findUnique.mockResolvedValue(TEMPLATE_ITEM);
    mocks.tx.cashflowItem.findFirst.mockResolvedValue(null);
    mocks.tx.cashflowGroup.findUnique.mockResolvedValue({ id: 'tpl-group', userId: null });
    mocks.tx.cashflowGroup.findFirst.mockResolvedValue({ id: 'user-group' });
    mocks.tx.cashflowItem.create.mockResolvedValue({ id: 'tombstone' });

    await expect(ocultarItemTemplateTx(tx, 'tpl-item', 'user-1')).resolves.toBe('tombstone');

    expect(mocks.tx.cashflowGroup.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', templateId: 'tpl-group' },
    });
    expect(mocks.tx.cashflowItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'user-group',
        templateId: 'tpl-item',
        hidden: true,
      }),
    });
  });

  it('sem resolvedor e sem override do grupo, falha (não personaliza dentro da transação)', async () => {
    mocks.tx.cashflowItem.findUnique.mockResolvedValue(TEMPLATE_ITEM);
    mocks.tx.cashflowItem.findFirst.mockResolvedValue(null);
    mocks.tx.cashflowGroup.findUnique.mockResolvedValue({ id: 'tpl-group', userId: null });
    mocks.tx.cashflowGroup.findFirst.mockResolvedValue(null);

    await expect(ocultarItemTemplateTx(tx, 'tpl-item', 'user-1')).rejects.toThrow(
      'Grupo do item ainda não personalizado',
    );
    expect(mocks.tx.cashflowItem.create).not.toHaveBeenCalled();
  });
});

describe('hideTemplateItem (delegando para ocultarItemTemplateTx)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usuário inexistente → erro antes de tocar no item', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    await expect(hideTemplateItem('tpl-item', 'user-x')).rejects.toThrow('Usuário não encontrado');
    expect(mocks.prisma.cashflowItem.findUnique).not.toHaveBeenCalled();
  });

  it('override já oculto → devolve o id sem escrever', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mocks.prisma.cashflowItem.findUnique.mockResolvedValue(TEMPLATE_ITEM);
    mocks.prisma.cashflowItem.findFirst.mockResolvedValue({ id: 'user-item', hidden: true });

    await expect(hideTemplateItem('tpl-item', 'user-1')).resolves.toBe('user-item');
    expect(mocks.prisma.cashflowItem.update).not.toHaveBeenCalled();
  });

  it('grupo-template sem override: personaliza o grupo e cria o tombstone nele', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mocks.prisma.cashflowItem.findUnique.mockResolvedValue(TEMPLATE_ITEM);
    mocks.prisma.cashflowItem.findFirst.mockResolvedValue(null);
    mocks.prisma.cashflowItem.create.mockResolvedValue({ id: 'tombstone' });
    mocks.prisma.cashflowGroup.findUnique
      // grupo do item (em ocultarItemTemplateTx)
      .mockResolvedValueOnce({ id: 'tpl-group', userId: null })
      // template carregado por personalizeGroup
      .mockResolvedValueOnce({
        id: 'tpl-group',
        userId: null,
        name: 'Habitação',
        parentId: null,
        items: [],
        children: [],
      });
    // personalizeGroup acha o override já existente por templateId.
    mocks.prisma.cashflowGroup.findFirst.mockResolvedValue({
      id: 'user-group',
      hidden: false,
      parentId: null,
    });

    await expect(hideTemplateItem('tpl-item', 'user-1')).resolves.toBe('tombstone');
    expect(mocks.prisma.cashflowItem.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        groupId: 'user-group',
        name: 'Internet',
        significado: null,
        rank: null,
        templateId: 'tpl-item',
        hidden: true,
      },
    });
  });
});
