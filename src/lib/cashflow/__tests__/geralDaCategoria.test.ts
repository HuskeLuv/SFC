import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { linhaTemGeralNaCategoria } from '../geralDaCategoria';

const item = (id: string, extra: Partial<CashflowItem> = {}) =>
  ({ id, name: id, ...extra }) as CashflowItem;
const grupo = (id: string, items: CashflowItem[], children: CashflowGroup[] = []) =>
  ({ id, name: id, items, children }) as unknown as CashflowGroup;

const arvore = [
  grupo(
    'despesas',
    [],
    [
      grupo(
        'habitacao',
        [item('cond'), item('geral-hab', { isGeral: true })],
        [grupo('apto', [item('energia')])],
      ),
      grupo('sem-geral', [item('livre')]),
    ],
  ),
];

describe('linhaTemGeralNaCategoria', () => {
  it('linha da categoria (ou de subgrupo dela) com Geral → true', () => {
    expect(linhaTemGeralNaCategoria(arvore, 'cond')).toBe(true);
    expect(linhaTemGeralNaCategoria(arvore, 'energia')).toBe(true);
  });

  it('categoria sem Geral, a própria Geral e linha inexistente → false', () => {
    expect(linhaTemGeralNaCategoria(arvore, 'livre')).toBe(false);
    expect(linhaTemGeralNaCategoria(arvore, 'geral-hab')).toBe(false);
    expect(linhaTemGeralNaCategoria(arvore, 'nada')).toBe(false);
  });
});
