// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { renderHookWithClient } from '@/test/wrappers';
import { mockFetchSequence } from '@/test/mocks/fetch';
import type { CashflowGroup } from '@/types/cashflow';

import { useCashflowData, useCollapsibleState, useProcessedData } from '../useCashflow';

beforeEach(() => {
  vi.restoreAllMocks();
});

const makeCashflowGroup = (overrides: Partial<CashflowGroup> = {}): CashflowGroup => ({
  id: 'group-1',
  userId: 'user-1',
  name: 'Receitas',
  type: 'entrada',
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
  ...overrides,
});

const makeInvestimentosGroup = (overrides: Partial<CashflowGroup> = {}): CashflowGroup =>
  makeCashflowGroup({
    id: 'inv-group',
    name: 'Investimentos',
    type: 'investimento',
    orderIndex: 2,
    items: [],
    ...overrides,
  });

const mockCashflowGroups: CashflowGroup[] = [
  makeCashflowGroup({
    id: 'receitas',
    name: 'Receitas',
    type: 'entrada',
    items: [
      {
        id: 'salario',
        userId: 'user-1',
        groupId: 'receitas',
        name: 'Salario',
        significado: null,
        rank: null,
        values: [
          { id: 'v1', itemId: 'salario', userId: 'user-1', year: 2026, month: 0, value: 10000 },
          { id: 'v2', itemId: 'salario', userId: 'user-1', year: 2026, month: 1, value: 10000 },
        ],
      },
    ],
  }),
  makeCashflowGroup({
    id: 'despesas',
    name: 'Despesas',
    type: 'despesa',
    items: [
      {
        id: 'aluguel',
        userId: 'user-1',
        groupId: 'despesas',
        name: 'Aluguel',
        significado: null,
        rank: null,
        values: [
          { id: 'v3', itemId: 'aluguel', userId: 'user-1', year: 2026, month: 0, value: 3000 },
          { id: 'v4', itemId: 'aluguel', userId: 'user-1', year: 2026, month: 1, value: 3000 },
        ],
      },
    ],
  }),
];

describe('useCashflowData', () => {
  it('fetches cashflow data on mount', async () => {
    const fetchMock = mockFetchSequence([
      { data: { groups: mockCashflowGroups, year: 2026 } },
      { data: { investimentos: [] } },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useCashflowData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cashflow',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(result.current.data.length).toBeGreaterThanOrEqual(2);
    expect(result.current.error).toBeNull();
  });

  it('merges investimentos into existing Investimentos group', async () => {
    const groupsWithInv = [...mockCashflowGroups, makeInvestimentosGroup()];
    const fetchMock = mockFetchSequence([
      { data: { groups: groupsWithInv, year: 2026 } },
      {
        data: {
          investimentos: [
            {
              id: 'inv-1',
              descricao: 'Tesouro Selic',
              valores: [
                { id: 'iv1', itemId: 'inv-1', userId: 'user-1', year: 2026, month: 0, value: 500 },
              ],
            },
          ],
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useCashflowData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const invGroup = result.current.data.find((g) => g.name === 'Investimentos');
    expect(invGroup).toBeDefined();
    expect(invGroup!.items.length).toBe(1);
    expect(invGroup!.items[0].name).toBe('Tesouro Selic');
  });

  it('maps investimentos item fields correctly', async () => {
    const groupsWithInv = [...mockCashflowGroups, makeInvestimentosGroup()];
    const fetchMock = mockFetchSequence([
      { data: { groups: groupsWithInv, year: 2026 } },
      {
        data: {
          investimentos: [
            {
              id: 'inv-2',
              name: 'CDB Banco',
              values: [
                { id: 'iv2', itemId: 'inv-2', userId: 'user-1', year: 2026, month: 3, value: 1200 },
              ],
            },
          ],
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useCashflowData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const invGroup = result.current.data.find((g) => g.name === 'Investimentos');
    expect(invGroup!.items[0].name).toBe('CDB Banco');
    expect(invGroup!.items[0].values[0].value).toBe(1200);
  });

  it('creates new Investimentos group when none exists', async () => {
    const fetchMock = mockFetchSequence([
      { data: { groups: mockCashflowGroups, year: 2026 } },
      {
        data: {
          investimentos: [
            {
              id: 'inv-3',
              descricao: 'LCI',
              valores: [
                { id: 'iv3', itemId: 'inv-3', userId: 'user-1', year: 2026, month: 0, value: 2000 },
              ],
            },
          ],
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useCashflowData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const invGroup = result.current.data.find((g) => g.name === 'Investimentos');
    expect(invGroup).toBeDefined();
    expect(invGroup!.id).toBe('investimentos-calculados');
    expect(invGroup!.items[0].name).toBe('LCI');
  });

  it('handles investimentos fetch failure gracefully', async () => {
    const fetchMock = mockFetchSequence([
      { data: { groups: mockCashflowGroups, year: 2026 } },
      { data: {}, status: 500 },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useCashflowData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should still have the base cashflow data
    expect(result.current.data.length).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('extracts year from cashflow response', async () => {
    const fetchMock = mockFetchSequence([
      { data: { groups: mockCashflowGroups, year: 2025 } },
      { data: { investimentos: [] } },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHookWithClient(() => useCashflowData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Year is used internally for the investimentos endpoint call
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cashflow/investimentos?year=2025',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

describe('useProcessedData', () => {
  it('calculates monthly totals correctly', () => {
    const { result } = renderHook(() => useProcessedData(mockCashflowGroups));

    // Salario: month 0 = 10000, month 1 = 10000
    expect(result.current.itemTotals['salario'][0]).toBe(10000);
    expect(result.current.itemTotals['salario'][1]).toBe(10000);
    expect(result.current.itemAnnualTotals['salario']).toBe(20000);

    // Aluguel: month 0 = 3000, month 1 = 3000
    expect(result.current.itemTotals['aluguel'][0]).toBe(3000);
    expect(result.current.itemTotals['aluguel'][1]).toBe(3000);
    expect(result.current.itemAnnualTotals['aluguel']).toBe(6000);

    // Entradas total
    expect(result.current.entradasTotal).toBe(20000);
    // Despesas total
    expect(result.current.despesasTotal).toBe(6000);
  });

  it('computes percentages relative to receita total', () => {
    const { result } = renderHook(() => useProcessedData(mockCashflowGroups));

    // receita total = 20000
    // receitas group percentage = 20000/20000 * 100 = 100%
    expect(result.current.groupPercentages['receitas']).toBeCloseTo(100);
    // despesas group percentage = 6000/20000 * 100 = 30%
    expect(result.current.groupPercentages['despesas']).toBeCloseTo(30);

    // item percentages
    expect(result.current.itemPercentages['salario']).toBeCloseTo(100);
    expect(result.current.itemPercentages['aluguel']).toBeCloseTo(30);
  });
});

describe('useCollapsibleState', () => {
  it('toggleCollapse toggles group state', () => {
    const { result } = renderHook(() => useCollapsibleState());

    expect(result.current.collapsed['g1']).toBeUndefined();

    act(() => {
      result.current.toggleCollapse('g1');
    });
    expect(result.current.collapsed['g1']).toBe(true);

    act(() => {
      result.current.toggleCollapse('g1');
    });
    expect(result.current.collapsed['g1']).toBe(false);
  });

  it('startAddingRow/cancelAddingRow lifecycle', () => {
    const { result } = renderHook(() => useCollapsibleState());

    // Start adding
    act(() => {
      result.current.startAddingRow('g1');
    });
    expect(result.current.addingRow['g1']).toBe(true);
    expect(result.current.newRow['g1']).toEqual({ name: '', significado: '' });

    // Cancel
    act(() => {
      result.current.cancelAddingRow('g1');
    });
    expect(result.current.addingRow['g1']).toBe(false);
    expect(result.current.newRow['g1']).toBeUndefined();
  });
});
