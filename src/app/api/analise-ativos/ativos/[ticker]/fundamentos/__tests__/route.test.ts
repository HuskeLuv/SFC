import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockExigir = vi.hoisted(() => vi.fn());
const mockObter = vi.hoisted(() => vi.fn());

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mockExigir,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/fundamentosEssencial', () => ({
  obterFundamentosEssencial: mockObter,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { FUNDAMENTOS_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/fundamentos`), {
    params: Promise.resolve({ ticker }),
  });

describe('GET /api/analise-ativos/ativos/[ticker]/fundamentos', () => {
  beforeEach(() => {
    mockExigir.mockReset();
    mockObter.mockReset();
    mockExigir.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
  });

  it('200 com o contrato, cache privado de 5 min e Server-Timing', async () => {
    mockObter.mockResolvedValue({ dados: FUNDAMENTOS_WEGE3, cache: false });
    const res = await chamar('WEGE3');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FUNDAMENTOS_WEGE3);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^fundamentos;desc="banco";dur=\d+(\.\d)?$/);
    expect(mockObter).toHaveBeenCalledWith('WEGE3');
  });

  it('cache em memória aparece no Server-Timing; ticker em minúsculas é normalizado', async () => {
    mockObter.mockResolvedValue({ dados: FUNDAMENTOS_WEGE3, cache: true });
    const res = await chamar('wege3');
    expect(res.headers.get('Server-Timing')).toContain('desc="cache"');
    expect(mockObter).toHaveBeenCalledWith('WEGE3');
  });

  it('sem acesso (flag desligada ou fora do beta) → 404 sem ler dados', async () => {
    mockExigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    const res = await chamar('WEGE3');
    expect(res.status).toBe(404);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('ticker inexistente na área → 404', async () => {
    mockObter.mockResolvedValue(null);
    const res = await chamar('ZZZZ3');
    expect(res.status).toBe(404);
  });

  it('formato inválido → 400', async () => {
    const res = await chamar('WEGE');
    expect(res.status).toBe(400);
    expect(mockObter).not.toHaveBeenCalled();
  });
});
