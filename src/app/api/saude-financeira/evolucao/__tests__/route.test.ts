import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  saudeFinanceiraSnapshot: { findMany: vi.fn() },
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

const req = () => new NextRequest('http://localhost/api/saude-financeira/evolucao');

const row = (year: number, month: number, patrimonioLiquido: number) => ({
  year,
  month,
  data: { patrimonioLiquido, status: 'EQ' },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/saude-financeira/evolucao', () => {
  it('devolve a série do mais antigo ao mais recente (o banco entrega desc)', async () => {
    mockPrisma.saudeFinanceiraSnapshot.findMany.mockResolvedValue([
      row(2026, 7, 160000),
      row(2026, 6, 155000),
      row(2025, 11, 140000),
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.snapshots).toHaveLength(3);
    expect(data.snapshots[0]).toMatchObject({ year: 2025, month: 11 });
    expect(data.snapshots[2]).toMatchObject({ year: 2026, month: 7 });
    expect(data.snapshots[2].data.patrimonioLiquido).toBe(160000);

    expect(mockPrisma.saudeFinanceiraSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 24,
      }),
    );
  });

  it('sem snapshots: lista vazia', async () => {
    mockPrisma.saudeFinanceiraSnapshot.findMany.mockResolvedValue([]);
    const res = await GET(req());
    const data = await res.json();
    expect(data.snapshots).toEqual([]);
  });
});
