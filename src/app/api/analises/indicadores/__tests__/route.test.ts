import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetAllIndicators = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ibov: { value: 125000, change: 1.2 },
    dolar: { value: 5.15, change: -0.3 },
    bitcoin: { value: 350000, change: 2.1 },
    ethereum: { value: 18000, change: 1.5 },
  }),
);

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

vi.mock('@/services/market/marketIndicatorService', () => ({
  getAllIndicators: mockGetAllIndicators,
}));

import { GET } from '../route';

const createRequest = () => {
  return new NextRequest(new URL('http://localhost/api/analises/indicadores'), { method: 'GET' });
};

describe('GET /api/analises/indicadores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
  });

  it('retorna indicadores com sucesso', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.indicators).toBeDefined();
    expect(data.indicators.ibov).toBeDefined();
    expect(data.indicators.dolar).toBeDefined();
    expect(data.indicators.bitcoin).toBeDefined();
    expect(data.indicators.ethereum).toBeDefined();
  });

  it('chama getAllIndicators uma vez', async () => {
    await GET(createRequest());

    expect(mockGetAllIndicators).toHaveBeenCalledTimes(1);
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna 500 quando servico falha', async () => {
    mockGetAllIndicators.mockRejectedValueOnce(new Error('Service unavailable'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
