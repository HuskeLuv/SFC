import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);
const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));

import { GET } from '../route';

const tx = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  date: new Date(Date.UTC(2026, 7, 10)),
  type: 'compra',
  quantity: 10,
  price: 50,
  total: 500,
  fees: 2,
  notes: null,
  asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.count.mockResolvedValue(0);
});

describe('GET /api/relatorios/movimentacoes', () => {
  it('lista movimentações com total+taxas e flag de reinvestimento', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx(),
      tx({
        id: 'tx-2',
        type: 'venda',
        notes: JSON.stringify({ operation: { action: 'reinvestimento' } }),
      }),
    ]);
    mockPrisma.stockTransaction.count.mockResolvedValue(2);

    const res = await GET(
      new NextRequest(
        'http://localhost/api/relatorios/movimentacoes?start=2026-08-01&end=2026-08-31',
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalNoPeriodo).toBe(2);
    expect(body.movimentacoes[0]).toMatchObject({
      data: '2026-08-10',
      operacao: 'compra',
      ativo: 'Petrobras',
      tipoAtivo: 'stock',
      total: 502,
      jaInvestido: false,
    });
    expect(body.movimentacoes[1].jaInvestido).toBe(true);

    // Janela inclusiva: end vira lt de end+1 dia.
    const where = mockPrisma.stockTransaction.findMany.mock.calls[0][0].where;
    expect(where.date.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(where.date.lt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('sem período: lista tudo (sem filtro de data)', async () => {
    await GET(new NextRequest('http://localhost/api/relatorios/movimentacoes'));
    const where = mockPrisma.stockTransaction.findMany.mock.calls[0][0].where;
    expect(where.date).toBeUndefined();
  });

  it('data inválida é ignorada (não explode)', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/relatorios/movimentacoes?start=banana'),
    );
    expect(res.status).toBe(200);
  });
});
