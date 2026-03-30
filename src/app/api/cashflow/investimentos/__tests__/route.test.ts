import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
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

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/cashflow/investimentos');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/cashflow/investimentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
  });

  it('retorna investimentos agrupados por tipo para o ano', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-123',
        type: 'compra',
        date: new Date('2026-03-15'),
        total: 1000,
        fees: 10,
        stock: { ticker: 'PETR4' },
        asset: null,
      },
      {
        id: 'tx-2',
        userId: 'user-123',
        type: 'compra',
        date: new Date('2026-03-20'),
        total: 500,
        fees: 5,
        stock: null,
        asset: { type: 'crypto' },
      },
    ]);

    const response = await GET(createRequest({ year: '2026' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.investimentos).toBeDefined();
    expect(Array.isArray(data.investimentos)).toBe(true);
    expect(data.totaisPorMes).toBeDefined();
    expect(typeof data.totalGeral).toBe('number');
    expect(data.totalGeral).toBeGreaterThan(0);
  });

  it('filtra por ano via query param', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-123',
        type: 'compra',
        date: new Date('2025-06-01'),
        total: 2000,
        fees: 0,
        stock: { ticker: 'VALE3' },
        asset: null,
      },
    ]);

    const response = await GET(createRequest({ year: '2025' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    // Transaction is in 2025, should appear in totals
    expect(data.totalGeral).toBeGreaterThan(0);
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna dados vazios quando nao ha transacoes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalGeral).toBe(0);
    expect(data.quantidadeTipos).toBe(0);
    expect(data.totaisPorMes.every((v: number) => v === 0)).toBe(true);
  });
});
