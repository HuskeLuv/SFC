import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCashBalances, getMonthlyFlows } from '../clientCashflowSummary';
import type { CashflowGroup } from '@/types/cashflow';

const { mockFindFirst, mockGetMergedCashflowGroups } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockGetMergedCashflowGroups: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: { cashflowValue: { findFirst: mockFindFirst } },
  prisma: { cashflowValue: { findFirst: mockFindFirst } },
}));

vi.mock('../getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));

const item = (
  id: string,
  valuesByMonth: Record<number, number>,
): CashflowGroup['items'][number] => ({
  id,
  userId: null,
  groupId: 'g',
  name: id,
  significado: null,
  rank: null,
  values: Object.entries(valuesByMonth).map(([month, value]) => ({
    id: `${id}-${month}`,
    itemId: id,
    userId: 'u',
    year: 2026,
    month: Number(month),
    value,
  })),
});

const group = (
  id: string,
  type: string,
  name: string,
  items: CashflowGroup['items'],
): CashflowGroup => ({
  id,
  userId: null,
  name,
  type,
  parentId: null,
  orderIndex: 0,
  items,
  children: [],
});

/** Árvore com entradas e despesas constantes em todos os 12 meses. */
const flatTree = (incomePerMonth: number, expensePerMonth: number): CashflowGroup[] => {
  const all = (v: number) => Object.fromEntries(Array.from({ length: 12 }, (_, m) => [m, v]));
  return [
    group('entradas', 'entrada', 'Entradas', [item('salario', all(incomePerMonth))]),
    group('fixas', 'despesa', 'Despesas Fixas', [item('aluguel', all(expensePerMonth))]),
  ];
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 1, 15)); // 15/fev/2026
  mockFindFirst.mockReset();
  mockGetMergedCashflowGroups.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getMonthlyFlows', () => {
  it('atravessa a virada de ano agregando cada ano uma única vez', async () => {
    mockGetMergedCashflowGroups.mockImplementation(async (_userId: string, year: number) =>
      year === 2025 ? flatTree(1000, 400) : flatTree(2000, 500),
    );

    // dez/2025, jan/2026, fev/2026
    const flows = await getMonthlyFlows('u1', 3);

    expect(flows).toHaveLength(3);
    expect(flows[0]).toMatchObject({ income: 1000, expenses: 400, net: 600 });
    expect(flows[0].date).toEqual(new Date(2025, 11, 1));
    expect(flows[1]).toMatchObject({ income: 2000, expenses: 500, net: 1500 });
    expect(flows[2].date).toEqual(new Date(2026, 1, 1));

    expect(mockGetMergedCashflowGroups).toHaveBeenCalledTimes(2);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledWith('u1', 2025);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledWith('u1', 2026);
  });

  it('retorna meses zerados quando não há lançamentos', async () => {
    mockGetMergedCashflowGroups.mockResolvedValue([]);

    const flows = await getMonthlyFlows('u1', 2);

    expect(flows).toHaveLength(2);
    for (const flow of flows) {
      expect(flow).toMatchObject({ income: 0, expenses: 0, net: 0 });
    }
  });
});

describe('getCashBalances', () => {
  it('soma anos anteriores inteiros e corta o ano corrente no mês atual', async () => {
    mockFindFirst.mockResolvedValue({ year: 2025 });
    mockGetMergedCashflowGroups.mockImplementation(async (_userId: string, year: number) =>
      year === 2025 ? flatTree(1000, 400) : flatTree(2000, 500),
    );

    const balances = await getCashBalances('u1');

    // 2025 completo (12 meses) + 2026 até fevereiro (2 meses) — os 10 meses
    // futuros de 2026 são projeção e ficam fora.
    expect(balances.total.income).toBe(12 * 1000 + 2 * 2000);
    expect(balances.total.expenses).toBe(12 * 400 + 2 * 500);
    expect(balances.total.net).toBe(balances.total.income - balances.total.expenses);
    expect(balances.monthly).toEqual({ income: 2000, expenses: 500, net: 1500 });
  });

  it('sem lançamento anterior, considera só o ano corrente', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockGetMergedCashflowGroups.mockResolvedValue(flatTree(3000, 1000));

    const balances = await getCashBalances('u1');

    expect(mockGetMergedCashflowGroups).toHaveBeenCalledTimes(1);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledWith('u1', 2026);
    expect(balances.total).toEqual({ income: 6000, expenses: 2000, net: 4000 });
  });
});
