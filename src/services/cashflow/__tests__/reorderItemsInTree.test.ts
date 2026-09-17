import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { findGroupInTree, moveIndex, reorderIds, reorderItemsInTree } from '../reorderItemsInTree';

const item = (id: string, groupId: string, orderIndex: number): CashflowItem => ({
  id,
  userId: 'u1',
  groupId,
  name: id.toUpperCase(),
  significado: null,
  rank: null,
  orderIndex,
  values: [],
});

const group = (
  id: string,
  items: CashflowItem[],
  children: CashflowGroup[] = [],
): CashflowGroup => ({
  id,
  userId: 'u1',
  name: id,
  type: 'despesa',
  parentId: null,
  orderIndex: 1,
  items,
  children,
});

const tree = (): CashflowGroup[] => [
  group('outro', [item('x', 'outro', 1)]),
  group(
    'pai',
    [],
    [group('filho', [item('a', 'filho', 1), item('b', 'filho', 2), item('c', 'filho', 3)])],
  ),
];

describe('moveIndex / reorderIds', () => {
  it('move para frente e para trás sem mutar a lista original', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(moveIndex(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveIndex(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('índices fora da lista devolvem cópia igual', () => {
    expect(moveIndex(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('reorderIds: soltar sobre outra linha reposiciona; mesmo lugar ou id de fora = null', () => {
    expect(reorderIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(reorderIds(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(reorderIds(['a', 'b', 'c'], 'a', 'a')).toBeNull();
    expect(reorderIds(['a', 'b', 'c'], 'a', 'zzz')).toBeNull();
  });
});

describe('findGroupInTree', () => {
  it('acha grupo em qualquer nível', () => {
    expect(findGroupInTree(tree(), 'filho')?.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(findGroupInTree(tree(), 'nao-existe')).toBeNull();
  });
});

describe('reorderItemsInTree', () => {
  it('reordena só o grupo alvo (subgrupo) e renumera orderIndex 1..N', () => {
    const next = reorderItemsInTree(tree(), 'filho', ['c', 'a', 'b']);
    const filho = findGroupInTree(next, 'filho')!;
    expect(filho.items.map((i) => [i.id, i.orderIndex])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('não mexe em grupos não tocados (mesma referência → React.memo continua valendo)', () => {
    const original = tree();
    const next = reorderItemsInTree(original, 'filho', ['b', 'a', 'c']);
    expect(next[0]).toBe(original[0]);
    expect(next[1]).not.toBe(original[1]);
    expect(original[1].children[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('ids que não estão na nova ordem vão pro fim, na ordem atual', () => {
    const next = reorderItemsInTree(tree(), 'filho', ['c']);
    expect(findGroupInTree(next, 'filho')!.items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('grupo inexistente devolve a mesma árvore', () => {
    const original = tree();
    expect(reorderItemsInTree(original, 'nada', ['a'])).toBe(original);
  });
});
