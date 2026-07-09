import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findFirst: vi.fn() },
  cashflowValue: { findFirst: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET } from '../route';

const callGET = () => GET(new NextRequest('http://localhost/api/cashflow/anos'), {});

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
  mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
  mockPrisma.cashflowValue.findFirst.mockResolvedValue(null);
});

describe('GET /api/cashflow/anos', () => {
  it('minYear = ano da transação mais antiga quando anterior aos valores lançados', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      date: new Date(Date.UTC(2022, 3, 12)),
    });
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({ year: 2024 });

    const res = await callGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ minYear: 2022 });
  });

  it('minYear = menor ano de CashflowValue quando não há transações', async () => {
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({ year: 2023 });

    const res = await callGET();
    expect(await res.json()).toEqual({ minYear: 2023 });
  });

  it('minYear = null quando o usuário não tem nenhum dado', async () => {
    const res = await callGET();
    expect(await res.json()).toEqual({ minYear: null });
  });

  it('escopa as queries ao usuário autenticado (targetUserId)', async () => {
    await callGET();
    expect(mockPrisma.stockTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(mockPrisma.cashflowValue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(
      Object.assign(new Error('Não autorizado'), { statusCode: 401 }),
    );
    const res = await callGET();
    expect(res.status).toBe(401);
  });
});
