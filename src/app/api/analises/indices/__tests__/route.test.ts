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

// A rota mantém cache TTL em nível de módulo keyado por (range, startDate);
// cada teste usa um range/startDate distinto pra não reaproveitar resposta.
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
    mockGetAssetHistory.mockResolvedValue([]);
  });

  it('retorna indices vazio quando nenhum dado disponivel', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.indices).toBeDefined();
    expect(Array.isArray(data.indices)).toBe(true);
    expect(data.indices).toHaveLength(0);
  });

  it('monta CDI a partir de economic_indexes (BACEN)', async () => {
    const day = 24 * 60 * 60 * 1000;
    const start = Date.UTC(2026, 0, 5); // segunda-feira
    const cdiRows = Array.from({ length: 30 }, (_, i) => ({
      indexType: 'CDI',
      date: new Date(start + i * day),
      value: 0.0005, // taxa diária decimal (0,05%/dia)
    }));
    mockPrisma.economicIndex.findMany.mockImplementation(({ where }: never) => {
      const w = where as { indexType?: string };
      return Promise.resolve(w?.indexType === 'CDI' ? cdiRows : []);
    });

    const response = await GET(createRequest({ range: '2y' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    const cdi = data.indices.find((s: { symbol: string }) => s.symbol === 'CDI');
    expect(cdi).toBeDefined();
    expect(cdi.data.length).toBeGreaterThan(0);
    // Série rebaseada em zero no início e acumulando as taxas diárias
    expect(cdi.data[0].value).toBe(0);
    const last = cdi.data[cdi.data.length - 1].value;
    expect(last).toBeGreaterThan(1); // ~29 dias × 0,05% ≈ 1,46%
    expect(last).toBeLessThan(2);
  });

  it('nao consulta a antiga tabela de benchmarks ingeridos (so fontes proprias)', async () => {
    const response = await GET(createRequest({ range: '3y' }));

    expect(response.status).toBe(200);
    // economic_indexes (CDI, IPCA, POUPANCA) + getAssetHistory (IBOV) são as únicas fontes
    expect(mockPrisma.economicIndex.findMany).toHaveBeenCalledTimes(3);
    expect(mockGetAssetHistory).toHaveBeenCalledTimes(1);
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

    const response = await GET(createRequest({ range: '5y' }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
