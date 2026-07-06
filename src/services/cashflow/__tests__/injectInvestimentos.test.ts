import { describe, it, expect } from 'vitest';
import {
  injectInvestimentosIntoGroups,
  filterInvestimentosComMovimento,
} from '../injectInvestimentos';
import type { CashflowGroup } from '@/types/cashflow';

const group = (id: string, type: string, name: string): CashflowGroup => ({
  id,
  userId: null,
  name,
  type,
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
});

const inv = (id: string, name: string, jan: number) => ({
  id,
  name,
  values: [{ id: `${id}-0`, itemId: id, userId: 'u', year: 2026, month: 0, value: jan }],
});

describe('filterInvestimentosComMovimento', () => {
  it('remove categorias com todos os meses zerados', () => {
    const result = filterInvestimentosComMovimento([inv('a', 'Ações', 100), inv('b', 'ETFs', 0)]);
    expect(result.map((i) => i.id)).toEqual(['a']);
  });
});

describe('injectInvestimentosIntoGroups', () => {
  it('substitui os itens do grupo investimento pelos calculados', () => {
    const tree = [
      group('entradas', 'entrada', 'Entradas'),
      group('inv', 'investimento', 'Investimentos'),
    ];
    const result = injectInvestimentosIntoGroups(tree, [inv('a', 'Ações', 100)]);
    const invGroup = result.find((g) => g.type === 'investimento')!;
    expect(invGroup.items).toHaveLength(1);
    expect(invGroup.items[0].name).toBe('Ações');
    expect(invGroup.items[0].groupId).toBe('inv');
  });

  it('cria grupo sintético quando a árvore não tem grupo investimento', () => {
    const tree = [group('entradas', 'entrada', 'Entradas')];
    const result = injectInvestimentosIntoGroups(tree, [inv('a', 'Ações', 100)]);
    const invGroup = result.find((g) => g.type === 'investimento')!;
    expect(invGroup.id).toBe('investimentos-calculados');
    expect(invGroup.items).toHaveLength(1);
  });

  it('remove grupo Investimentos legado aninhado em despesas', () => {
    const despesas = group('desp', 'despesa', 'Despesas');
    despesas.children = [group('legado', 'despesa', 'Investimentos')];
    const tree = [despesas, group('inv', 'investimento', 'Investimentos')];
    const result = injectInvestimentosIntoGroups(tree, []);
    expect(result.find((g) => g.id === 'desp')!.children).toHaveLength(0);
  });

  it('sem investimentos e sem grupo na árvore → árvore inalterada', () => {
    const tree = [group('entradas', 'entrada', 'Entradas')];
    const result = injectInvestimentosIntoGroups(tree, []);
    expect(result).toHaveLength(1);
  });
});
