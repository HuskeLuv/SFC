import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import {
  filterMoveTargets,
  groupMoveTargetsByTrail,
  listMoveTargets,
  normalizeSearch,
} from '../moveTargets';

const item = (id: string, over: Partial<CashflowItem> = {}): CashflowItem => ({
  id,
  userId: 'u1',
  groupId: 'g',
  name: id,
  significado: null,
  rank: null,
  values: [],
  ...over,
});

const group = (over: Partial<CashflowGroup> & { id: string }): CashflowGroup => ({
  userId: 'u1',
  name: over.id,
  type: 'despesa',
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
  ...over,
});

const tree: CashflowGroup[] = [
  group({
    id: 'entradas',
    name: 'Entradas',
    type: 'entrada',
    children: [
      group({
        id: 'ent-fixas',
        name: 'Entradas Fixas',
        type: 'entrada',
        parentId: 'entradas',
        items: [item('salario')],
      }),
    ],
  }),
  group({
    id: 'despesas',
    name: 'Despesas',
    children: [
      group({
        id: 'fixas',
        name: 'Despesas Fixas',
        parentId: 'despesas',
        children: [
          group({
            id: 'moradia',
            name: 'Moradia',
            parentId: 'fixas',
            items: [item('aluguel'), item('luz'), item('oculta', { hidden: true })],
          }),
          group({ id: 'transporte', name: 'Transporte', parentId: 'fixas' }),
        ],
      }),
      group({ id: 'sumido', name: 'Sumido', parentId: 'despesas', hidden: true }),
    ],
  }),
  group({ id: 'cc', name: 'Conta Corrente', type: 'saldo', items: [item('saldo')] }),
  group({ id: 'inv', name: 'Investimentos', type: 'investimento', items: [item('aporte')] }),
];

describe('listMoveTargets', () => {
  it('só grupos-folha de entrada/despesa, na ordem da planilha, sem o grupo atual', () => {
    const targets = listMoveTargets(tree, 'moradia');
    expect(targets.map((t) => t.groupId)).toEqual(['ent-fixas', 'transporte']);
  });

  it('trilha com os grupos acima e contagem de linhas visíveis', () => {
    const targets = listMoveTargets(tree, 'transporte');
    const moradia = targets.find((t) => t.groupId === 'moradia');
    expect(moradia).toMatchObject({
      name: 'Moradia',
      trail: 'Despesas › Despesas Fixas',
      type: 'despesa',
      itemCount: 2,
    });
    expect(targets.find((t) => t.groupId === 'ent-fixas')?.trail).toBe('Entradas');
  });

  it('nunca Conta Corrente, Aporte/Resgate, grupos com filhos ou ocultos', () => {
    const ids = listMoveTargets(tree, 'x').map((t) => t.groupId);
    expect(ids).not.toContain('cc');
    expect(ids).not.toContain('inv');
    expect(ids).not.toContain('despesas');
    expect(ids).not.toContain('fixas');
    expect(ids).not.toContain('sumido');
  });
});

describe('busca e agrupamento', () => {
  it('normaliza acento e caixa', () => {
    expect(normalizeSearch('  Educação ')).toBe('educacao');
  });

  it('filtra por nome ou trilha', () => {
    const targets = listMoveTargets(tree, 'x');
    expect(filterMoveTargets(targets, 'TRANSP').map((t) => t.groupId)).toEqual(['transporte']);
    expect(filterMoveTargets(targets, 'fixas').map((t) => t.groupId)).toEqual([
      'ent-fixas',
      'moradia',
      'transporte',
    ]);
    expect(filterMoveTargets(targets, '')).toHaveLength(targets.length);
  });

  it('agrupa pela trilha mantendo a ordem', () => {
    const sections = groupMoveTargetsByTrail(listMoveTargets(tree, 'x'));
    expect(sections.map((s) => [s.trail, s.targets.map((t) => t.groupId)])).toEqual([
      ['Entradas', ['ent-fixas']],
      ['Despesas › Despesas Fixas', ['moradia', 'transporte']],
    ]);
  });
});
