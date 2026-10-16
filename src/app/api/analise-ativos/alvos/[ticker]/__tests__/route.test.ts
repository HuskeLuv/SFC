import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    asset: { findUnique: vi.fn() },
    planningAssetTarget: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  requireAuthWithActing: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mocks.logSensitiveEndpointAccess,
}));
vi.mock('jose', () => ({ jwtVerify: mocks.jwtVerify }));
vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');

import { DELETE, GET, PUT } from '../route';
import { limparCacheAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { middleware } from '@/middleware';
import { CSRF_COOKIE_NAME } from '@/utils/csrf';

const URL_WEGE = 'http://localhost/api/analise-ativos/alvos/WEGE3';
const ctx = (ticker = 'WEGE3') => ({ params: Promise.resolve({ ticker }) });
const put = (corpo: unknown) =>
  new NextRequest(URL_WEGE, {
    method: 'PUT',
    body: JSON.stringify(corpo),
    headers: { 'Content-Type': 'application/json' },
  });
const del = () => new NextRequest(URL_WEGE, { method: 'DELETE' });
const ATUALIZADO = new Date('2026-10-15T14:32:00Z');
const ASSETS: Record<string, string> = { WEGE3: 'a-wege', ITUB4: 'a-itub', HGLG11: 'a-hglg' };

/** Banco fake: alvos por (userId, assetId). */
let alvos: Map<string, { targetPct: number; atualizadoPorUserId: string | null }>;
const chave = (userId: string, assetId: string) => `${userId}|${assetId}`;

const comoUsuario = (id: string) =>
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id, email: `${id}@x`, role: 'user' },
    targetUserId: id,
    actingClient: null,
  });
const comoConsultor = () =>
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id: 'c1', email: 'c@x', role: 'consultant' },
    targetUserId: 'u1',
    actingClient: { id: 'u1', name: 'Cliente', email: 'u1@x' },
  });

type Where = { userId_assetId: { userId: string; assetId: string } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
  alvos = new Map([[chave('u1', 'a-wege'), { targetPct: 6, atualizadoPorUserId: null }]]);
  mocks.prisma.asset.findUnique.mockImplementation(
    async ({ where }: { where: { symbol: string } }) =>
      ASSETS[where.symbol] ? { id: ASSETS[where.symbol] } : null,
  );
  mocks.prisma.planningAssetTarget.findUnique.mockImplementation(
    async ({ where }: { where: Where }) => {
      const a = alvos.get(chave(where.userId_assetId.userId, where.userId_assetId.assetId));
      return a ? { targetPct: a.targetPct, updatedAt: ATUALIZADO } : null;
    },
  );
  mocks.prisma.planningAssetTarget.upsert.mockImplementation(
    async ({
      where,
      create,
    }: {
      where: Where;
      create: { targetPct: number; atualizadoPorUserId: string | null };
    }) => {
      alvos.set(chave(where.userId_assetId.userId, where.userId_assetId.assetId), {
        targetPct: create.targetPct,
        atualizadoPorUserId: create.atualizadoPorUserId,
      });
      return { targetPct: create.targetPct, updatedAt: ATUALIZADO };
    },
  );
  mocks.prisma.planningAssetTarget.deleteMany.mockImplementation(
    async ({ where }: { where: { userId: string; assetId: string } }) => {
      const k = chave(where.userId, where.assetId);
      const havia = alvos.delete(k);
      return { count: havia ? 1 : 0 };
    },
  );
  comoUsuario('u1');
});

describe('GET /api/analise-ativos/alvos/[ticker]', () => {
  it('devolve o alvo do usuário (no-store)', async () => {
    const res = await GET(new NextRequest(URL_WEGE), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      ticker: 'WEGE3',
      alvo: { targetPct: 6, atualizadoEm: ATUALIZADO.toISOString() },
    });
  });

  it('sem alvo: alvo null', async () => {
    const res = await GET(new NextRequest(URL_WEGE), ctx('ITUB4'));
    expect(await res.json()).toEqual({ ticker: 'ITUB4', alvo: null });
  });

  it('ticker em minúsculas é normalizado; sem Asset ou inválido → 404', async () => {
    expect((await GET(new NextRequest(URL_WEGE), ctx('wege3'))).status).toBe(200);
    expect((await GET(new NextRequest(URL_WEGE), ctx('ZZZZ3'))).status).toBe(404);
    expect((await GET(new NextRequest(URL_WEGE), ctx('../x'))).status).toBe(404);
  });

  it('sem sessão → 401', async () => {
    mocks.requireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await GET(new NextRequest(URL_WEGE), ctx())).status).toBe(401);
  });

  it('flag desligada → 404 antes da sessão', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', '');
    expect((await GET(new NextRequest(URL_WEGE), ctx())).status).toBe(404);
    expect(mocks.requireAuthWithActing).not.toHaveBeenCalled();
  });

  it('fora do beta → 404', async () => {
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    comoUsuario('u-fora');
    limparCacheAcessoAnalise('u-fora');
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'user', featureBetas: [] });
    expect((await GET(new NextRequest(URL_WEGE), ctx())).status).toBe(404);
    expect(mocks.prisma.planningAssetTarget.findUnique).not.toHaveBeenCalled();
  });
});

describe('PUT / DELETE', () => {
  it('PUT cria e é idempotente (upsert por userId+assetId)', async () => {
    const r1 = await PUT(put({ targetPct: 5 }), ctx('ITUB4'));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({
      ticker: 'ITUB4',
      alvo: { targetPct: 5, atualizadoEm: ATUALIZADO.toISOString() },
    });
    await PUT(put({ targetPct: 5 }), ctx('ITUB4'));
    expect(mocks.prisma.planningAssetTarget.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.planningAssetTarget.upsert.mock.calls[1][0].where).toEqual({
      userId_assetId: { userId: 'u1', assetId: 'a-itub' },
    });
    expect([...alvos.keys()].filter((k) => k.endsWith('a-itub'))).toHaveLength(1);
    expect(alvos.get(chave('u1', 'a-itub'))).toEqual({ targetPct: 5, atualizadoPorUserId: null });
  });

  it('PUT arredonda a 3 casas (Decimal(6,3)) e aceita 100', async () => {
    await PUT(put({ targetPct: 6.12345 }), ctx());
    expect(alvos.get(chave('u1', 'a-wege'))?.targetPct).toBe(6.123);
    expect((await PUT(put({ targetPct: 100 }), ctx())).status).toBe(200);
  });

  it.each([
    ['zero', { targetPct: 0 }],
    ['negativo', { targetPct: -1 }],
    ['acima de 100', { targetPct: 100.5 }],
    ['texto', { targetPct: '6' }],
    ['campo extra', { targetPct: 6, objetivo: 6 }],
    ['vazio', {}],
  ])('PUT %s → 400 e nada gravado', async (_n, corpo) => {
    const r = await PUT(put(corpo), ctx());
    expect(r.status).toBe(400);
    expect(mocks.prisma.planningAssetTarget.upsert).not.toHaveBeenCalled();
  });

  it('PUT com JSON inválido → 400; ticker sem Asset → 404', async () => {
    const req = new NextRequest(URL_WEGE, { method: 'PUT', body: '{' });
    expect((await PUT(req, ctx())).status).toBe(400);
    expect((await PUT(put({ targetPct: 5 }), ctx('ZZZZ3'))).status).toBe(404);
  });

  it('IDOR: o u2 grava na chave do u2, sem tocar a do u1', async () => {
    comoUsuario('u2');
    await PUT(put({ targetPct: 9 }), ctx());
    expect(alvos.get(chave('u1', 'a-wege'))?.targetPct).toBe(6);
    expect(alvos.get(chave('u2', 'a-wege'))?.targetPct).toBe(9);
  });

  it('DELETE apaga só a do usuário; sem alvo → removido=false', async () => {
    const r = await DELETE(del(), ctx());
    expect(await r.json()).toEqual({ ticker: 'WEGE3', removido: true });
    expect(alvos.has(chave('u1', 'a-wege'))).toBe(false);
    const r2 = await DELETE(del(), ctx());
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ ticker: 'WEGE3', removido: false });
    expect(mocks.prisma.planningAssetTarget.deleteMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      assetId: 'a-wege',
    });
  });

  it('a rota não toca o Objetivo da Carteira (Portfolio/Watchlist)', async () => {
    await PUT(put({ targetPct: 7 }), ctx());
    await DELETE(del(), ctx());
    expect(Object.keys(mocks.prisma)).not.toContain('portfolio');
    expect(Object.keys(mocks.prisma)).not.toContain('watchlist');
  });
});

describe('consultor agindo pelo cliente', () => {
  it('grava no cliente, com atualizadoPorUserId e log do acesso', async () => {
    comoConsultor();
    const r = await PUT(put({ targetPct: 4 }), ctx('ITUB4'));
    expect(r.status).toBe(200);
    expect(alvos.get(chave('u1', 'a-itub'))).toEqual({ targetPct: 4, atualizadoPorUserId: 'c1' });
    expect(alvos.has(chave('c1', 'a-itub'))).toBe(false);
    expect(mocks.logSensitiveEndpointAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'c1' }),
      'u1',
      expect.objectContaining({ id: 'u1' }),
      '/api/analise-ativos/alvos/ITUB4',
      'PUT',
    );
  });

  it('GET e DELETE também no cliente, com log', async () => {
    comoConsultor();
    const g = await GET(new NextRequest(URL_WEGE), ctx());
    expect((await g.json()).alvo.targetPct).toBe(6);
    await DELETE(del(), ctx());
    expect(alvos.has(chave('u1', 'a-wege'))).toBe(false);
    expect(mocks.logSensitiveEndpointAccess).toHaveBeenCalledTimes(2);
  });

  it('usuário comum: sem log e atualizadoPorUserId null', async () => {
    await PUT(put({ targetPct: 3 }), ctx());
    expect(mocks.logSensitiveEndpointAccess).not.toHaveBeenCalled();
    expect(alvos.get(chave('u1', 'a-wege'))?.atualizadoPorUserId).toBeNull();
  });
});

describe('CSRF (middleware) na rota do alvo', () => {
  const CSRF = 'a'.repeat(64);
  const pelaBorda = (method: string, headers: Record<string, string> = {}) => {
    const req = new NextRequest(new URL('/api/analise-ativos/alvos/WEGE3', 'http://localhost'), {
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
