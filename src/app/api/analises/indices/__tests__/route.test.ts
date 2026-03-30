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
  economicIndex: { findMany: vi.fn().mockResolvedValue([]) },
  benchmarkCumulativeReturn: { findMany: vi.fn().mockResolvedValue([]) },
}));

const mockGetAssetHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetHistory: mockGetAssetHistory,
}));

import { GET } from '../route';

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/analises/indices');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/analises/indices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockPrisma.benchmarkCumulativeReturn.findMany.mockResolvedValue([]);
    mockGetAssetHistory.mockResolvedValue([]);
  });

  it('retorna indices vazio quando nenhum dado disponivel', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.indices).toBeDefined();
    expect(Array.isArray(data.indices)).toBe(true);
  });

  it('retorna dados de benchmark_cumulative_returns quando disponivel', async () => {
    const now = Date.now();
    const mockBenchmarkData = [
      { date: new Date(now - 86400000 * 30), cumulativeReturn: 1.5 },
      { date: new Date(now - 86400000 * 15), cumulativeReturn: 2.3 },
      { date: new Date(now - 86400000), cumulativeReturn: 3.1 },
    ];

    // Return data for all 4 benchmark types
    mockPrisma.benchmarkCumulativeReturn.findMany.mockResolvedValue(mockBenchmarkData);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.indices).toBeDefined();
    expect(Array.isArray(data.indices)).toBe(true);
  });

  it('aceita parametro range', async () => {
    const response = await GET(createRequest({ range: '1mo' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.indices).toBeDefined();
  });

  it('aceita parametro startDate', async () => {
    const startDate = String(Date.now() - 86400000 * 60);
    const response = await GET(createRequest({ startDate }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.indices).toBeDefined();
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
