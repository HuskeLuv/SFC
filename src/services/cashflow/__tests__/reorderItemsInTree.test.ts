import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import {
  findGroupInTree,
  insertId,
  moveIndex,
  moveItemInTree,
  reorderIds,
  reorderItemsInTree,
} from '../reorderItemsInTree';

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

describe('insertId', () => {
  it('insere antes ou depois da linha alvo', () => {
    expect(insertId(['a', 'b', 'c'], 'x', 'b', false)).toEqual(['a', 'x', 'b', 'c']);
    expect(insertId(['a', 'b', 'c'], 'x', 'c', true)).toEqual(['a', 'b', 'c', 'x']);
  });

  it('sem alvo (cabeçalho do grupo) vai pro fim; alvo desconhecido também', () => {
    expect(insertId(['a', 'b'], 'x', null, false)).toEqual(['a', 'b', 'x']);
    expect(insertId(['a', 'b'], 'x', 'zz', false)).toEqual(['a', 'b', 'x']);
    expect(insertId([], 'x', null, false)).toEqual(['x']);
  });
});

describe('moveItemInTree', () => {
  const tree = () => [
    group('receitas', [item('salario', 'receitas', 1)]),
    group(
      'despesas',
      [],
      [
        group('hab', [item('aluguel', 'hab', 1), item('internet', 'hab', 2)]),
        group('lazer', [item('cinema', 'lazer', 1)]),
      ],
    ),
  ];

  it('tira a linha da origem e põe no destino, na ordem pedida', () => {
    const next = moveItemInTree(tree(), 'internet', 'lazer', ['internet', 'cinema']);
    const hab = findGroupInTree(next, 'hab')!;
    const lazer = findGroupInTree(next, 'lazer')!;
    expect(hab.items!.map((i) => i.id)).toEqual(['aluguel']);
    expect(lazer.items!.map((i) => [i.id, i.groupId, i.orderIndex])).toEqual([
      ['internet', 'lazer', 1],
      ['cinema', 'lazer', 2],
    ]);
  });

  it('atravessa seções de nível 1 (despesa → receita)', () => {
    const next = moveItemInTree(tree(), 'cinema', 'receitas', ['salario', 'cinema']);
    expect(findGroupInTree(next, 'receitas')!.items!.map((i) => i.id)).toEqual([
      'salario',
      'cinema',
    ]);
    expect(findGroupInTree(next, 'lazer')!.items).toEqual([]);
  });

  it('não mexe em nada quando item ou destino não existem', () => {
    const original = tree();
    expect(moveItemInTree(original, 'nada', 'lazer', ['nada'])).toBe(original);
    expect(moveItemInTree(original, 'cinema', 'nada', ['cinema'])).toBe(original);
  });
});
