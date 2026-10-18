import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser } from '@/test/mocks/auth';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  flagsEua: vi.fn(() => ({ eua: false, euaPreco: false })),
  versao: vi.fn(),
  linhas: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mocks.exigir,
  flagsEua: mocks.flagsEua,
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => ({
  versaoQuadro: mocks.versao,
  obterLinhasQuadro: mocks.linhas,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { LINHAS_FIXTURE, linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
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
    const res = await GET(req({ 'if-none-match': `"busca-v2-${V1}"` }));
    expect(res.status).toBe(404);
    expect(mocks.linhas).not.toHaveBeenCalled();
  });

  it('200 com todas as linhas (inclusive fora do Quadro), ETag e cache privado de 1 h', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe(`"busca-v2-${V1}"`);
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

  it('v2.4: itens sem i/e e sem chave /indice|semaforo|destaque/', async () => {
    const corpo = (await (await GET(req())).json()) as BuscaIndiceResposta;
    const chaves = new Set(corpo.itens.flatMap((i) => Object.keys(i)));
    expect([...chaves].sort()).toEqual(['c', 'f', 'm', 'n', 'q', 't']);
    expect(Object.keys(corpo).filter((k) => /indice|semaforo|destaque/i.test(k))).toEqual([]);
  });

  it('ETag do formato antigo (sem v2) não serve mais', async () => {
    const res = await GET(req({ 'if-none-match': `"busca-${V1}"` }));
    expect(res.status).toBe(200);
  });

  it('304 quando o If-None-Match bate com a versão', async () => {
    const res = await GET(req({ 'if-none-match': `W/"busca-v2-${V1}"` }));
    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe(`"busca-v2-${V1}"`);
  });

  it('versão nova: ETag velho não serve e o índice é remontado', async () => {
    mocks.versao.mockResolvedValue('2026-10-01T10:40:00.000Z');
    mocks.linhas.mockResolvedValue(LINHAS_FIXTURE.slice(0, 2));
    const res = await GET(req({ 'if-none-match': `"busca-v2-${V1}"` }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as BuscaIndiceResposta).itens).toHaveLength(2);
  });
});

describe('GET /api/analise-ativos/busca — Stocks e REITs', () => {
  const EUA = [
    linhaQuadroDb({ symbol: 'AAPL', classe: 'stock', nome: 'Apple Inc.', moeda: 'USD' }),
    linhaQuadroDb({ symbol: 'O', classe: 'reit', nome: 'Realty Income Corp', moeda: 'USD' }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exigir.mockResolvedValue(mockAuthAsUser('u1'));
    mocks.versao.mockResolvedValue('v-eua');
    mocks.linhas.mockResolvedValue([...LINHAS_FIXTURE, ...EUA]);
  });

  it('sem a chave EUA o índice é o de hoje; com ela, stock/reit entram com a classe', async () => {
    mocks.flagsEua.mockReturnValue({ eua: false, euaPreco: false });
    const sem = await GET(req());
    const itensSem = ((await sem.json()) as BuscaIndiceResposta).itens;
    expect(itensSem.some((i) => i.c === 'stock' || i.c === 'reit')).toBe(false);

    mocks.flagsEua.mockReturnValue({ eua: true, euaPreco: false });
    const com = await GET(req());
    const itensCom = ((await com.json()) as BuscaIndiceResposta).itens;
    expect(itensCom.find((i) => i.t === 'AAPL')?.c).toBe('stock');
    expect(itensCom.find((i) => i.t === 'O')?.c).toBe('reit');
    expect(com.headers.get('etag')).not.toBe(sem.headers.get('etag'));
  });
});
