import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  economicIndex: {
    findFirst: vi.fn(),
  },
  portfolio: {
    aggregate: vi.fn(),
  },
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

const req = () => new NextRequest('http://localhost/api/planejamento-sonhos/defaults');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/planejamento-sonhos/defaults', () => {
  it('converte CDI anual em mensal composto e soma totalInvested', async () => {
    // CDI anual = 13.65% → mensal ≈ 0.01072
    mockPrisma.economicIndex.findFirst.mockResolvedValue({ value: 13.65 });
    mockPrisma.portfolio.aggregate.mockResolvedValue({ _sum: { totalInvested: 12_345.67 } });

    const res = await GET(req());
    const data = await res.json();

    expect(data.available).toBe(12345.67);
    // (1 + 0.1365)^(1/12) - 1 ≈ 0.01072
    expect(data.rate).toBeCloseTo(0.01072, 4);
  });

  it('cai no fallback de 0.9%/mês quando não há registro de CDI', async () => {
    mockPrisma.economicIndex.findFirst.mockResolvedValue(null);
    mockPrisma.portfolio.aggregate.mockResolvedValue({ _sum: { totalInvested: 0 } });

    const res = await GET(req());
    const data = await res.json();

    expect(data.rate).toBeCloseTo(0.009, 4);
    expect(data.available).toBe(0);
  });

  it('available=0 quando _sum.totalInvested é null', async () => {
    mockPrisma.economicIndex.findFirst.mockResolvedValue({ value: 10 });
    mockPrisma.portfolio.aggregate.mockResolvedValue({ _sum: { totalInvested: null } });

    const res = await GET(req());
    const data = await res.json();

    expect(data.available).toBe(0);
  });

  it('ignora CDI fora do range (≥100% ou negativo) usando fallback', async () => {
    // value=150 vira 1.5 → fora de (0,1) → fallback
    mockPrisma.economicIndex.findFirst.mockResolvedValue({ value: 150 });
    mockPrisma.portfolio.aggregate.mockResolvedValue({ _sum: { totalInvested: 1000 } });

    const res = await GET(req());
    const data = await res.json();

    expect(data.rate).toBeCloseTo(0.009, 4);
  });
});
