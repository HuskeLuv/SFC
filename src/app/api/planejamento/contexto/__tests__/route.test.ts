import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { CashflowGroup } from '@/types/cashflow';

const mockPrisma = vi.hoisted(() => ({
  economicIndex: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  portfolio: {
    aggregate: vi.fn(),
    findMany: vi.fn(),
  },
  stockTransaction: {
    findMany: vi.fn(),
  },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

const mockGetMergedCashflowGroups = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/planejamento/contexto');

const cashflowTree = (): CashflowGroup[] => [
  {
    id: 'entradas',
    userId: null,
    name: 'Entradas',
    type: 'entrada',
    parentId: null,
    orderIndex: 0,
    children: [],
    items: [
      {
        id: 'salario',
        userId: null,
        groupId: 'entradas',
        name: 'Salário',
        significado: null,
        rank: null,
        values: [
          { id: 'a', itemId: 'salario', userId: 'u', year: 2026, month: 0, value: 5000 },
          { id: 'b', itemId: 'salario', userId: 'u', year: 2026, month: 1, value: 5000 },
        ],
      },
    ],
  },
  {
    id: 'fixas',
    userId: null,
    name: 'Despesas Fixas',
    type: 'despesa',
    parentId: null,
    orderIndex: 1,
    children: [],
    items: [
      {
        id: 'aluguel',
        userId: null,
        groupId: 'fixas',
        name: 'Aluguel',
        significado: null,
        rank: null,
        values: [
          { id: 'c', itemId: 'aluguel', userId: 'u', year: 2026, month: 0, value: 2000 },
          { id: 'd', itemId: 'aluguel', userId: 'u', year: 2026, month: 1, value: 2000 },
        ],
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.aggregate.mockResolvedValue({ _sum: { totalInvested: 50_000 } });
  mockPrisma.portfolio.findMany.mockResolvedValue([
    {
      totalInvested: 10_000,
      quantity: 0,
      avgPrice: 0,
      asset: { type: 'emergency', symbol: 'RESERVA-EMERG' },
    },
    {
      totalInvested: 40_000,
      quantity: 100,
      avgPrice: 30,
      asset: { type: 'stock', symbol: 'PETR4' },
    },
  ]);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([
    { total: 6000, price: 0, quantity: 0 },
    { total: 6000, price: 0, quantity: 0 },
  ]);
  mockPrisma.economicIndex.findFirst.mockResolvedValue({ value: 13.65 });
  mockPrisma.economicIndex.findMany.mockResolvedValue(
    Array.from({ length: 12 }, () => ({ value: 0.004 })), // 0,4%/mês
  );
  mockGetMergedCashflowGroups.mockResolvedValue(cashflowTree());
});

describe('GET /api/planejamento/contexto', () => {
  it('agrega patrimônio, reserva, aporte, CDI, inflação e fluxo de caixa', async () => {
    const res = await GET(req());
    const data = await res.json();

    expect(data.patrimonio).toBe(50_000);
    expect(data.reservaEmergenciaAtual).toBe(10_000); // só o item de reserva
    expect(data.aporteMensalRealizado).toBe(1000); // (6000+6000)/12
    expect(data.cdiAnualizado).toBe(13.7); // arredondado 1 casa
    // (1.004)^12 - 1 ≈ 4.9%
    expect(data.inflacao12m).toBeCloseTo(4.9, 1);
    expect(data.cashflow.sobraMensalMedia).toBe(3000); // (5000-2000) por mês
    expect(data.cashflow.despesaFixaMensal).toBe(2000);
    expect(data.cashflow.year).toBe(new Date().getFullYear());
  });

  it('cai no ano anterior quando o ano corrente não tem meses preenchidos', async () => {
    mockGetMergedCashflowGroups
      .mockResolvedValueOnce([]) // ano corrente vazio
      .mockResolvedValueOnce(cashflowTree()); // ano anterior

    const res = await GET(req());
    const data = await res.json();

    expect(data.cashflow.year).toBe(new Date().getFullYear() - 1);
    expect(data.cashflow.sobraMensalMedia).toBe(3000);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledTimes(2);
  });

  it('inflacao12m null quando não há 12 registros de IPCA', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([{ value: 0.004 }]);
    const res = await GET(req());
    const data = await res.json();
    expect(data.inflacao12m).toBeNull();
    expect(data.inflacaoFallback).toBe(4.5);
  });

  it('cdiAnualizado null e patrimônio 0 em conta vazia', async () => {
    mockPrisma.economicIndex.findFirst.mockResolvedValue(null);
    mockPrisma.portfolio.aggregate.mockResolvedValue({ _sum: { totalInvested: null } });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const res = await GET(req());
    const data = await res.json();

    expect(data.cdiAnualizado).toBeNull();
    expect(data.patrimonio).toBe(0);
    expect(data.reservaEmergenciaAtual).toBe(0);
    expect(data.aporteMensalRealizado).toBe(0);
  });
});
