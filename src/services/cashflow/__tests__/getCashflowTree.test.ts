import { describe, it, expect } from 'vitest';
import { mergeTemplatesWithCustomizations } from '../getCashflowTree';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

const item = (overrides: Partial<CashflowItem>): CashflowItem => ({
  id: 'item-id',
  userId: null,
  groupId: 'group-id',
  name: 'Item',
  significado: null,
  rank: null,
  values: [],
  ...overrides,
});

const group = (overrides: Partial<CashflowGroup>): CashflowGroup => ({
  id: 'group-id',
  userId: null,
  name: 'Grupo',
  type: 'despesa',
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
  ...overrides,
});

describe('mergeTemplatesWithCustomizations', () => {
  it('normaliza o groupId dos itens para o id final do grupo mesclado', () => {
    // Grupo template com 2 itens; o usuário tem um override do grupo (id
    // próprio) e um override de 1 dos itens. Antes do fix, os itens mesclados
    // mantinham groupId do template enquanto o grupo assumia o id do override —
    // o front agrupa por `item.groupId === group.id` e o save virava no-op.
    const tplItemA = item({ id: 'tpl-item-a', groupId: 'tpl-group', name: 'Aluguel' });
    const tplItemB = item({ id: 'tpl-item-b', groupId: 'tpl-group', name: 'Condomínio' });
    const template = group({
      id: 'tpl-group',
      name: 'Habitação',
      items: [tplItemA, tplItemB],
    });

    const userItemA = item({
      id: 'user-item-a',
      userId: 'user-1',
      groupId: 'user-group',
      templateId: 'tpl-item-a',
      name: 'Aluguel',
      values: [],
    });
    const userCustomItem = item({
      id: 'user-item-custom',
      userId: 'user-1',
      groupId: 'user-group',
      templateId: null,
      name: 'Linha custom',
    });
    const override = group({
      id: 'user-group',
      userId: 'user-1',
      templateId: 'tpl-group',
      name: 'Habitação',
      items: [userItemA, userCustomItem],
    });

    const [merged] = mergeTemplatesWithCustomizations([template], [override]);

    expect(merged.id).toBe('user-group');
    expect(merged.items).toHaveLength(3);
    for (const it of merged.items) {
      expect(it.groupId).toBe('user-group');
    }
  });

  it('normaliza groupId também em grupos aninhados com override', () => {
    const tplChildItem = item({ id: 'tpl-child-item', groupId: 'tpl-child', name: 'Energia' });
    const template = group({
      id: 'tpl-root',
      name: 'Despesas Fixas',
      children: [
        group({ id: 'tpl-child', parentId: 'tpl-root', name: 'Habitação', items: [tplChildItem] }),
      ],
    });

    const childOverride = group({
      id: 'user-child',
      userId: 'user-1',
      parentId: 'user-root',
      templateId: 'tpl-child',
      name: 'Habitação',
    });
    const rootOverride = group({
      id: 'user-root',
      userId: 'user-1',
      templateId: 'tpl-root',
      name: 'Despesas Fixas',
      children: [childOverride],
    });

    const [merged] = mergeTemplatesWithCustomizations([template], [rootOverride]);

    expect(merged.children[0].id).toBe('user-child');
    expect(merged.children[0].items[0].groupId).toBe('user-child');
  });

  it('mantém groupId intacto no fast path sem personalizações', () => {
    const tplItem = item({ id: 'tpl-item', groupId: 'tpl-group', name: 'Aluguel' });
    const template = group({ id: 'tpl-group', name: 'Habitação', items: [tplItem] });

    const [merged] = mergeTemplatesWithCustomizations([template], []);

    expect(merged.id).toBe('tpl-group');
    expect(merged.items[0].groupId).toBe('tpl-group');
  });
});
