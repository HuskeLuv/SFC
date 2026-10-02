import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    analiseTese: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  requireAuthWithActing: vi.fn(),
  obterLinhaQuadro: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => ({
  obterLinhaQuadro: mocks.obterLinhaQuadro,
}));
vi.mock('jose', () => ({ jwtVerify: mocks.jwtVerify }));
vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');

import { DELETE, GET, PUT } from '../route';
import { limparCacheAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { middleware } from '@/middleware';
import { CSRF_COOKIE_NAME } from '@/utils/csrf';

const URL_WEGE = 'http://localhost/api/analise-ativos/teses/WEGE3';
const ctx = (ticker = 'WEGE3') => ({ params: Promise.resolve({ ticker }) });
const put = (corpo: unknown) =>
  new NextRequest(URL_WEGE, {
    method: 'PUT',
    body: JSON.stringify(corpo),
    headers: { 'Content-Type': 'application/json' },
  });
const ATUALIZADO = new Date('2026-10-02T14:32:00Z');

/** Banco fake: teses por (userId, symbol). */
let teses: Map<string, { corpo: string; updatedAt: Date }>;
const chave = (userId: string, symbol: string) => `${userId}|${symbol}`;

const comoUsuario = (id: string) =>
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id, email: `${id}@x`, role: 'user' },
    targetUserId: id,
    actingClient: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
  teses = new Map([[chave('u1', 'WEGE3'), { corpo: 'tese do u1', updatedAt: ATUALIZADO }]]);
  mocks.obterLinhaQuadro.mockImplementation(async (s: string) =>
    ['WEGE3', 'ITUB4', 'HGLG11'].includes(s) ? { symbol: s } : null,
  );
  mocks.prisma.analiseTese.findUnique.mockImplementation(
    async ({ where }: { where: { userId_symbol: { userId: string; symbol: string } } }) =>
      teses.get(chave(where.userId_symbol.userId, where.userId_symbol.symbol)) ?? null,
  );
  mocks.prisma.analiseTese.upsert.mockImplementation(
    async ({
      where,
      create,
    }: {
      where: { userId_symbol: { userId: string; symbol: string } };
      create: { corpo: string };
    }) => {
      const k = chave(where.userId_symbol.userId, where.userId_symbol.symbol);
      teses.set(k, { corpo: create.corpo, updatedAt: ATUALIZADO });
      return { updatedAt: ATUALIZADO };
    },
  );
  mocks.prisma.analiseTese.deleteMany.mockImplementation(
    async ({ where }: { where: { userId: string; symbol: string } }) => {
      teses.delete(chave(where.userId, where.symbol));
      return { count: 1 };
    },
  );
  comoUsuario('u1');
});

describe('GET /api/analise-ativos/teses/[ticker]', () => {
  it('devolve a tese do usuário logado', async () => {
    const res = await GET(new NextRequest(URL_WEGE), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      corpo: 'tese do u1',
      atualizadoEm: ATUALIZADO.toISOString(),
      visibilidade: 'privada',
    });
  });

  it('GET vazio: corpo "" e atualizadoEm null', async () => {
    const res = await GET(new NextRequest(URL_WEGE), ctx('ITUB4'));
    expect(await res.json()).toEqual({ corpo: '', atualizadoEm: null, visibilidade: 'privada' });
  });

  it('IDOR: outro usuário NUNCA lê a tese do u1 (consulta presa ao payload.id)', async () => {
    comoUsuario('u2');
    const res = await GET(new NextRequest(URL_WEGE), ctx());
    expect(await res.json()).toMatchObject({ corpo: '', atualizadoEm: null });
    expect(mocks.prisma.analiseTese.findUnique.mock.calls[0][0].where).toEqual({
      userId_symbol: { userId: 'u2', symbol: 'WEGE3' },
    });
  });

  it('ticker em minúsculas é normalizado; ticker inválido ou fora da área → 404', async () => {
    expect((await GET(new NextRequest(URL_WEGE), ctx('wege3'))).status).toBe(200);
    expect((await GET(new NextRequest(URL_WEGE), ctx('ZZZZ3'))).status).toBe(404);
    expect((await GET(new NextRequest(URL_WEGE), ctx('../x'))).status).toBe(404);
  });

  it('consultor agindo pelo cliente → 403, sem ler nada', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      payload: { id: 'c1', email: 'c@x', role: 'consultant' },
      targetUserId: 'u1',
      actingClient: { id: 'u1', name: 'Cliente', email: 'u1@x' },
    });
    const res = await GET(new NextRequest(URL_WEGE), ctx());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('A tese é pessoal');
    expect(mocks.prisma.analiseTese.findUnique).not.toHaveBeenCalled();
  });

  it('flag desligada → 404 antes da sessão', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', '');
    const res = await GET(new NextRequest(URL_WEGE), ctx());
    expect(res.status).toBe(404);
    expect(mocks.requireAuthWithActing).not.toHaveBeenCalled();
  });

  it('fora do beta → 404', async () => {
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    comoUsuario('u-fora');
    limparCacheAcessoAnalise('u-fora');
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'user', featureBetas: [] });
    const res = await GET(new NextRequest(URL_WEGE), ctx());
    expect(res.status).toBe(404);
    expect(mocks.prisma.analiseTese.findUnique).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mocks.requireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await GET(new NextRequest(URL_WEGE), ctx())).status).toBe(401);
  });
});

describe('PUT / DELETE', () => {
  it('PUT cria, depois atualiza; GET devolve o novo texto', async () => {
    const r1 = await PUT(put({ corpo: 'primeira' }), ctx('ITUB4'));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ atualizadoEm: ATUALIZADO.toISOString() });
    await PUT(put({ corpo: '  segunda  ' }), ctx('ITUB4'));
    const g = await GET(new NextRequest(URL_WEGE), ctx('ITUB4'));
    expect((await g.json()).corpo).toBe('segunda');
  });

  it('PUT com corpo vazio apaga', async () => {
    const r = await PUT(put({ corpo: '   ' }), ctx());
    expect(await r.json()).toEqual({ atualizadoEm: null });
    expect(teses.has(chave('u1', 'WEGE3'))).toBe(false);
  });

  it('PUT > 10.000 caracteres → 400 e nada gravado', async () => {
    const r = await PUT(put({ corpo: 'x'.repeat(10_001) }), ctx());
    expect(r.status).toBe(400);
    expect(mocks.prisma.analiseTese.upsert).not.toHaveBeenCalled();
  });

  it('PUT com JSON inválido → 400', async () => {
    const req = new NextRequest(URL_WEGE, { method: 'PUT', body: '{' });
    expect((await PUT(req, ctx())).status).toBe(400);
  });

  it('IDOR: PUT do u2 grava na chave do u2, sem tocar a do u1', async () => {
    comoUsuario('u2');
    await PUT(put({ corpo: 'do u2' }), ctx());
    expect(teses.get(chave('u1', 'WEGE3'))?.corpo).toBe('tese do u1');
    expect(teses.get(chave('u2', 'WEGE3'))?.corpo).toBe('do u2');
  });

  it('DELETE apaga só a do usuário e devolve ok', async () => {
    comoUsuario('u2');
    const r = await DELETE(new NextRequest(URL_WEGE, { method: 'DELETE' }), ctx());
    expect(await r.json()).toEqual({ ok: true });
    expect(teses.get(chave('u1', 'WEGE3'))?.corpo).toBe('tese do u1');
  });

  it('consultor agindo: PUT e DELETE → 403, nada gravado', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      payload: { id: 'c1', email: 'c@x', role: 'consultant' },
      targetUserId: 'u1',
      actingClient: { id: 'u1', name: 'Cliente', email: 'u1@x' },
    });
    expect((await PUT(put({ corpo: 'x' }), ctx())).status).toBe(403);
    expect((await DELETE(new NextRequest(URL_WEGE, { method: 'DELETE' }), ctx())).status).toBe(403);
    expect(mocks.prisma.analiseTese.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.analiseTese.deleteMany).not.toHaveBeenCalled();
  });
});

describe('CSRF (middleware) na rota da tese', () => {
  const CSRF = 'a'.repeat(64);
  const pelaBorda = (method: string, headers: Record<string, string> = {}) => {
    const req = new NextRequest(new URL('/api/analise-ativos/teses/WEGE3', 'http://localhost'), {
      method,
      headers,
    });
    req.cookies.set('token', 'jwt.valido');
    req.cookies.set(CSRF_COOKIE_NAME, CSRF);
    return req;
  };

  beforeEach(() => {
    mocks.jwtVerify.mockResolvedValue({ payload: { sub: 'u1' } });
  });

  it('PUT e DELETE sem x-csrf-token → 403', async () => {
    for (const m of ['PUT', 'DELETE']) {
      const res = await middleware(pelaBorda(m));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toContain('CSRF');
    }
  });

  it('PUT com o token certo passa pela borda', async () => {
    const res = await middleware(pelaBorda('PUT', { 'x-csrf-token': CSRF }));
    expect(res.status).not.toBe(403);
  });
});
