import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser } from '@/test/mocks/auth';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  versao: vi.fn(),
  linhas: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mocks.exigir,
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => ({
  versaoQuadro: mocks.versao,
  obterLinhasQuadro: mocks.linhas,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { BuscaIndiceResposta } from '@/types/analiseAtivosApi';

const V1 = '2026-09-30T10:40:00.000Z';
const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/analise-ativos/busca', { headers });

describe('GET /api/analise-ativos/busca', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exigir.mockResolvedValue(mockAuthAsUser('u1'));
    mocks.versao.mockResolvedValue(V1);
    mocks.linhas.mockResolvedValue(LINHAS_FIXTURE);
  });

  it('404 sem acesso, antes de qualquer leitura (inclusive com If-None-Match)', async () => {
    mocks.exigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    const res = await GET(req({ 'if-none-match': `"busca-${V1}"` }));
    expect(res.status).toBe(404);
    expect(mocks.linhas).not.toHaveBeenCalled();
  });

  it('200 com todas as linhas (inclusive fora do Quadro), ETag e cache privado de 1 h', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe(`"busca-${V1}"`);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600');
    const corpo = (await res.json()) as BuscaIndiceResposta;
    expect(corpo.versao).toBe(V1);
    expect(corpo.itens).toHaveLength(LINHAS_FIXTURE.length);
    expect(corpo.itens.find((i) => i.t === 'CEDO4')).toMatchObject({
      q: false,
      m: 'sem_negociacao_30',
    });
    expect(mocks.linhas).toHaveBeenCalledWith(undefined, { incluirForaDoQuadro: true });
  });

  it('304 quando o If-None-Match bate com a versão', async () => {
    const res = await GET(req({ 'if-none-match': `W/"busca-${V1}"` }));
    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe(`"busca-${V1}"`);
  });

  it('versão nova: ETag velho não serve e o índice é remontado', async () => {
    mocks.versao.mockResolvedValue('2026-10-01T10:40:00.000Z');
    mocks.linhas.mockResolvedValue(LINHAS_FIXTURE.slice(0, 2));
    const res = await GET(req({ 'if-none-match': `"busca-${V1}"` }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as BuscaIndiceResposta).itens).toHaveLength(2);
  });
});
