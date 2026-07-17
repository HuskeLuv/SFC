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

  it('startDate meia-noite LOCAL (03:00Z) nao perde o mes de abertura do IPCA', async () => {
    // IPCA/POUPANCA sao rows MENSAIS datadas no dia 1o 00:00Z. Antes do fix, o
    // startDate vinha CRU do cliente (meia-noite local = 03:00Z em UTC-3) direto
    // no Prisma gte — o row de 01/01 00:00Z ficava fora e o mes inteiro de
    // abertura sumia da serie. A rota agora normaliza pra 00:00Z antes de usar.
    const monthlyRows = Array.from({ length: 8 }, (_, i) => ({
      indexType: 'IPCA',
      date: new Date(Date.UTC(2025, i, 1)),
      value: 0.004, // 0,4%/mes em decimal
    }));
    mockPrisma.economicIndex.findMany.mockImplementation(({ where }: never) => {
      const w = where as { indexType?: string; date?: { gte?: Date } };
      if (w?.indexType !== 'IPCA') return Promise.resolve([]);
      const gte = w?.date?.gte;
      return Promise.resolve(gte ? monthlyRows.filter((r) => r.date >= gte) : monthlyRows);
    });

    // Cliente antigo (cache/URL): 01/01/2025 00:00 local em UTC-3 = 03:00Z
    const localMidnight = String(Date.UTC(2025, 0, 1) + 3 * 60 * 60 * 1000);
    const response = await GET(createRequest({ range: '10y', startDate: localMidnight }));
    const data = await response.json();

    expect(response.status).toBe(200);
    const ipca = data.indices.find((s: { symbol: string }) => s.symbol === 'IPCA');
    expect(ipca).toBeDefined();
    // Ancora exatamente no dia-borda (01/01 00:00Z), rebaseada em 0
    expect(ipca.data[0].date).toBe(Date.UTC(2025, 0, 1));
    expect(ipca.data[0].value).toBe(0);
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
