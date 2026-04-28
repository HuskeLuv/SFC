import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn().mockResolvedValue([]) },
  cashflowGroup: { findMany: vi.fn().mockResolvedValue([]) },
  fixedIncomeAsset: { findMany: vi.fn().mockResolvedValue([]) },
  portfolioGoal: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

const mockFiPricer = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ buildValueSeriesForAsset: vi.fn() }),
);
const mockComputeLiveTotals = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ saldoBruto: 0, valorAplicado: 0 }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/portfolio/patrimonioHistoricoBuilder', () => ({
  filterInvestmentsExclReservas: (xs: unknown[]) => xs,
}));
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: mockFiPricer,
}));
vi.mock('@/services/portfolio/portfolioLiveTotals', () => ({
  computePortfolioLiveTotals: mockComputeLiveTotals,
}));

import { GET, PUT, DELETE } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/analises/portfolio-goal', { method: 'GET' });

const createPutRequest = (body: object) =>
  new NextRequest('http://localhost/api/analises/portfolio-goal', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const createDeleteRequest = () =>
  new NextRequest('http://localhost/api/analises/portfolio-goal', { method: 'DELETE' });

describe('GET /api/analises/portfolio-goal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.portfolioGoal.findUnique.mockResolvedValue(null);
    mockComputeLiveTotals.mockResolvedValue({ saldoBruto: 0, valorAplicado: 0 });
  });

  it('retorna hasGoal=false quando não há meta', async () => {
    mockComputeLiveTotals.mockResolvedValue({ saldoBruto: 50000, valorAplicado: 50000 });

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGoal).toBe(false);
    expect(data.targetEquity).toBeNull();
    expect(data.currentEquity).toBe(50000);
    expect(data.progressPercent).toBe(0);
  });

  it('calcula progressPercent e monthlyContributionNeeded com meta ativa', async () => {
    const targetYear = new Date().getFullYear() + 5;
    mockPrisma.portfolioGoal.findUnique.mockResolvedValue({
      id: 'g1',
      userId: 'user-123',
      targetEquity: 1000000,
      targetYear,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockComputeLiveTotals.mockResolvedValue({ saldoBruto: 250000, valorAplicado: 200000 });

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGoal).toBe(true);
    expect(data.targetEquity).toBe(1000000);
    expect(data.targetYear).toBe(targetYear);
    expect(data.currentEquity).toBe(250000);
    expect(data.progressPercent).toBeCloseTo(25, 1);
    expect(data.isAchieved).toBe(false);
    // Gap = 750000; aporte mensal = 750000 / monthsRemaining
    expect(data.monthsRemaining).toBeGreaterThan(0);
    expect(data.monthlyContributionNeeded).toBeGreaterThan(0);
    expect(data.monthlyContributionNeeded).toBeLessThan(750000); // sanity: dividido por meses
  });

  it('isAchieved=true e contribuição zerada quando meta já alcançada', async () => {
    mockPrisma.portfolioGoal.findUnique.mockResolvedValue({
      id: 'g1',
      userId: 'user-123',
      targetEquity: 100000,
      targetYear: new Date().getFullYear() + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockComputeLiveTotals.mockResolvedValue({ saldoBruto: 150000, valorAplicado: 100000 });

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(data.isAchieved).toBe(true);
    expect(data.progressPercent).toBe(100); // capped
    expect(data.monthlyContributionNeeded).toBe(0);
  });
});

describe('PUT /api/analises/portfolio-goal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockComputeLiveTotals.mockResolvedValue({ saldoBruto: 50000, valorAplicado: 50000 });
  });

  it('cria/atualiza meta e retorna status atualizado', async () => {
    const targetYear = new Date().getFullYear() + 3;
    mockPrisma.portfolioGoal.upsert.mockResolvedValue({
      id: 'g1',
      userId: 'user-123',
      targetEquity: 500000,
      targetYear,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await PUT(createPutRequest({ targetEquity: 500000, targetYear }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGoal).toBe(true);
    expect(data.targetEquity).toBe(500000);
    expect(data.targetYear).toBe(targetYear);
    expect(mockPrisma.portfolioGoal.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      update: { targetEquity: 500000, targetYear },
      create: { userId: 'user-123', targetEquity: 500000, targetYear },
    });
  });

  it('rejeita targetEquity negativo ou zero', async () => {
    const response = await PUT(
      createPutRequest({ targetEquity: -100, targetYear: new Date().getFullYear() + 1 }),
    );
    expect(response.status).toBe(400);
  });

  it('rejeita targetYear no passado', async () => {
    const response = await PUT(
      createPutRequest({ targetEquity: 100000, targetYear: new Date().getFullYear() - 1 }),
    );
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/analises/portfolio-goal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockComputeLiveTotals.mockResolvedValue({ saldoBruto: 50000, valorAplicado: 50000 });
  });

  it('remove meta e devolve status sem goal', async () => {
    mockPrisma.portfolioGoal.deleteMany.mockResolvedValue({ count: 1 });

    const response = await DELETE(createDeleteRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGoal).toBe(false);
    expect(mockPrisma.portfolioGoal.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
    });
  });
});
