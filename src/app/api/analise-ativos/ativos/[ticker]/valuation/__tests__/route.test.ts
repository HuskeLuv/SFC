import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockExigir = vi.hoisted(() => vi.fn());
const mockObter = vi.hoisted(() => vi.fn());

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mockExigir,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/valuationMultiplos', () => ({
  obterValuation: mockObter,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { VALUATION_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/valuation`), {
    params: Promise.resolve({ ticker }),
  });

describe('GET /api/analise-ativos/ativos/[ticker]/valuation', () => {
  beforeEach(() => {
    mockExigir.mockReset();
    mockObter.mockReset();
    mockExigir.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
  });

  it('200 com o contrato, cache privado de 5 min e Server-Timing', async () => {
    mockObter.mockResolvedValue({ dados: VALUATION_WEGE3, cache: false });
    const res = await chamar('WEGE3');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(VALUATION_WEGE3);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^valuation;desc="banco";dur=\d+(\.\d)?$/);
  });

  it('consultor agindo pelo cliente também lê (dado público do ativo)', async () => {
    mockExigir.mockResolvedValue({
      payload: { id: 'cons' },
      targetUserId: 'cli',
      actingClient: { id: 'cli' },
    });
    mockObter.mockResolvedValue({ dados: VALUATION_WEGE3, cache: true });
    const res = await chamar('WEGE3');
    expect(res.status).toBe(200);
    expect(res.headers.get('Server-Timing')).toContain('desc="cache"');
  });

  it('sem acesso → 404; sem sessão → 401', async () => {
    mockExigir.mockRejectedValueOnce(new ApiError(404, 'Recurso não disponível'));
    expect((await chamar('WEGE3')).status).toBe(404);
    mockExigir.mockRejectedValueOnce(new Error('Não autorizado'));
    expect((await chamar('WEGE3')).status).toBe(401);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('ticker inexistente → 404; formato inválido → 400', async () => {
    mockObter.mockResolvedValue(null);
    expect((await chamar('ZZZZ3')).status).toBe(404);
    expect((await chamar('WEGE3%3B')).status).toBe(400);
  });
});
