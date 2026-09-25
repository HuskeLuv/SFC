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

  it('ordena itens por orderIndex (reordenação do usuário), com desempate por nome', () => {
    const template = group({
      id: 'tpl-group',
      name: 'Habitação',
      items: [
        item({ id: 'a', groupId: 'tpl-group', name: 'Aluguel', orderIndex: 1 }),
        item({ id: 'b', groupId: 'tpl-group', name: 'Condomínio', orderIndex: 2 }),
        item({ id: 'c', groupId: 'tpl-group', name: 'Zuper (sem índice)', orderIndex: 0 }),
      ],
    });

    const [merged] = mergeTemplatesWithCustomizations([template], []);
    // orderIndex 0 vem antes; entre 1 e 2 mantém a ordem; alfabético só desempata.
    expect(merged.items.map((i) => i.name)).toEqual([
      'Zuper (sem índice)',
      'Aluguel',
      'Condomínio',
    ]);
  });

  it('override de item carrega a POSIÇÃO escolhida pelo usuário por cima do template', () => {
    const template = group({
      id: 'tpl-group',
      name: 'Habitação',
      items: [
        item({ id: 'tpl-a', groupId: 'tpl-group', name: 'Aluguel', orderIndex: 1 }),
        item({ id: 'tpl-b', groupId: 'tpl-group', name: 'Condomínio', orderIndex: 2 }),
        item({ id: 'tpl-c', groupId: 'tpl-group', name: 'Internet', orderIndex: 3 }),
      ],
    });
    // Usuário moveu Internet pro topo: override com orderIndex 0.
    const override = group({
      id: 'user-group',
      userId: 'user-1',
      templateId: 'tpl-group',
      name: 'Habitação',
      items: [
        item({
          id: 'user-c',
          userId: 'user-1',
          groupId: 'user-group',
          templateId: 'tpl-c',
          name: 'Internet',
          orderIndex: 0,
        }),
      ],
    });

    const [merged] = mergeTemplatesWithCustomizations([template], [override]);
    expect(merged.items.map((i) => i.name)).toEqual(['Internet', 'Aluguel', 'Condomínio']);
    expect(merged.items[0].id).toBe('user-c');
  });

  describe('linha movida para outra seção (drag-and-drop livre)', () => {
    // Template: Habitação (Aluguel, Internet) e Lazer (Cinema). O usuário
    // arrastou Internet para Lazer: o override dela mora no override de Lazer.
    const templates = () => [
      group({
        id: 'tpl-hab',
        name: 'Habitação',
        orderIndex: 1,
        items: [
          item({ id: 'tpl-aluguel', groupId: 'tpl-hab', name: 'Aluguel', orderIndex: 1 }),
          item({ id: 'tpl-internet', groupId: 'tpl-hab', name: 'Internet', orderIndex: 2 }),
        ],
      }),
      group({
        id: 'tpl-lazer',
        name: 'Lazer',
        orderIndex: 2,
        items: [item({ id: 'tpl-cinema', groupId: 'tpl-lazer', name: 'Cinema', orderIndex: 1 })],
      }),
    ];
    const internetMovida = (groupId: string) =>
      item({
        id: 'user-internet',
        userId: 'user-1',
        groupId,
        templateId: 'tpl-internet',
        name: 'Internet',
        orderIndex: 2,
        values: [
          { id: 'v1', itemId: 'user-internet', userId: 'user-1', year: 2026, month: 0, value: 99 },
        ],
      } as Partial<CashflowItem>);

    it('some do grupo do template e aparece no grupo de destino, com os valores', () => {
      const lazerOverride = group({
        id: 'user-lazer',
        userId: 'user-1',
        templateId: 'tpl-lazer',
        name: 'Lazer',
        orderIndex: 2,
        items: [
          item({
            id: 'user-cinema',
            userId: 'user-1',
            groupId: 'user-lazer',
            templateId: 'tpl-cinema',
            name: 'Cinema',
            orderIndex: 1,
          }),
          internetMovida('user-lazer'),
        ],
      });

      const [hab, lazer] = mergeTemplatesWithCustomizations(templates(), [lazerOverride]);

      expect(hab.items.map((i) => i.name)).toEqual(['Aluguel']);
      expect(lazer.items.map((i) => i.id)).toEqual(['user-cinema', 'user-internet']);
      expect(lazer.items[1].groupId).toBe('user-lazer');
      expect(lazer.items[1].values?.[0]?.value).toBe(99);
    });

    it('funciona para grupo criado pelo usuário (sem template)', () => {
      const custom = group({
        id: 'user-custom',
        userId: 'user-1',
        templateId: null,
        name: 'Minha seção',
        orderIndex: 3,
        items: [internetMovida('user-custom')],
      });

      const merged = mergeTemplatesWithCustomizations(templates(), [custom]);

      expect(merged[0].items.map((i) => i.name)).toEqual(['Aluguel']);
      expect(merged[2].id).toBe('user-custom');
      expect(merged[2].items.map((i) => i.id)).toEqual(['user-internet']);
    });

    it('override no próprio grupo (override do grupo do template) continua no lugar', () => {
      const habOverride = group({
        id: 'user-hab',
        userId: 'user-1',
        templateId: 'tpl-hab',
        name: 'Habitação',
        orderIndex: 1,
        items: [internetMovida('user-hab')],
      });

      const [hab, lazer] = mergeTemplatesWithCustomizations(templates(), [habOverride]);

      expect(hab.items.map((i) => i.id)).toEqual(['tpl-aluguel', 'user-internet']);
      expect(lazer.items.map((i) => i.name)).toEqual(['Cinema']);
    });
  });
});
