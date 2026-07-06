import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockPrisma = vi.hoisted(() => ({
  cashflowValue: { aggregate: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/cashflow/conta-corrente-anterior');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/cashflow/conta-corrente-anterior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna saldo de dezembro do ano anterior (grupos type=saldo)', async () => {
    mockPrisma.cashflowValue.aggregate.mockResolvedValue({ _sum: { value: 639.9 } });

    const response = await GET(createRequest({ year: '2026' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ year: 2026, saldoDezembroAnterior: 639.9 });
    expect(mockPrisma.cashflowValue.aggregate).toHaveBeenCalledWith({
      _sum: { value: true },
      where: {
        userId: 'user-123',
        year: 2025,
        month: 11,
        item: { group: { type: 'saldo' } },
      },
    });
  });

  it('retorna 0 quando não há valores no ano anterior', async () => {
    mockPrisma.cashflowValue.aggregate.mockResolvedValue({ _sum: { value: null } });

    const response = await GET(createRequest({ year: '2026' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.saldoDezembroAnterior).toBe(0);
  });

  it('rejeita ano inválido', async () => {
    const response = await GET(createRequest({ year: 'abc' }));
    expect(response.status).toBe(400);
  });
});
