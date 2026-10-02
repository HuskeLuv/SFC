import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';
import { mockAuthAsUser } from '@/test/mocks/auth';
import { ATIVO_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';

const mockExigir = vi.hoisted(() => vi.fn());
const mockMontar = vi.hoisted(() => vi.fn());

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mockExigir,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/montarTopoAtivo', () => ({
  montarTopoAtivo: mockMontar,
}));

import { GET } from '../route';

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}`), {
    params: Promise.resolve({ ticker }),
  });

describe('GET /api/analise-ativos/ativos/[ticker]', () => {
  beforeEach(() => {
    mockExigir.mockReset().mockResolvedValue(mockAuthAsUser('u1'));
    mockMontar.mockReset().mockResolvedValue(ATIVO_WEGE3);
  });

  it('200 com o topo, cache privado de 5 min e Server-Timing', async () => {
    const res = await chamar('WEGE3');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^topo;dur=\d+(\.\d)?$/);
    expect((await res.json()).ticker).toBe('WEGE3');
    expect(mockMontar).toHaveBeenCalledWith('WEGE3');
  });

  it('ticker em minúsculas é normalizado', async () => {
    await chamar('wege3');
    expect(mockMontar).toHaveBeenCalledWith('WEGE3');
  });

  it('ticker inexistente → 404', async () => {
    mockMontar.mockResolvedValue(null);
    const res = await chamar('XXXX3');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Ativo não encontrado na Análise de Ativos');
  });

  it('formato inválido → 400 sem tocar no banco', async () => {
    const res = await chamar('WEG');
    expect(res.status).toBe(400);
    expect(mockMontar).not.toHaveBeenCalled();
  });

  it('sem acesso (flag/beta) → 404 antes de montar', async () => {
    mockExigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    const res = await chamar('WEGE3');
    expect(res.status).toBe(404);
    expect(mockMontar).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mockExigir.mockRejectedValue(new Error('Não autorizado'));
    expect((await chamar('WEGE3')).status).toBe(401);
  });
});
