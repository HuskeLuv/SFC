import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    asset: { findUnique: vi.fn() },
    portfolio: { findFirst: vi.fn(), update: vi.fn() },
    watchlist: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    planningAssetTarget: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
  requireAuthWithActing: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
  jwtVerify: vi.fn(),
  invalidarContextoUsuario: vi.fn(),
  recordObjetivoClasseDefinido: vi.fn(),
  recordPlanejadoAdicionado: vi.fn(),
  recordPlanejadoEditado: vi.fn(),
  recordPlanejadoRemovido: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mocks.logSensitiveEndpointAccess,
}));
vi.mock('@/services/assistente/contexto', () => ({
  invalidarContextoUsuario: mocks.invalidarContextoUsuario,
}));
vi.mock('@/services/changeHistory', () => ({
  assetEntityLabel: (a: { symbol?: string } | null) => a?.symbol,
  recordObjetivoClasseDefinido: mocks.recordObjetivoClasseDefinido,
  recordPlanejadoAdicionado: mocks.recordPlanejadoAdicionado,
  recordPlanejadoEditado: mocks.recordPlanejadoEditado,
  recordPlanejadoRemovido: mocks.recordPlanejadoRemovido,
}));
vi.mock('jose', () => ({ jwtVerify: mocks.jwtVerify }));
vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');

import { DELETE, GET, PUT } from '../route';
import { limparCacheAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { middleware } from '@/middleware';
import { CSRF_COOKIE_NAME } from '@/utils/csrf';

const urlDe = (t: string) => `http://localhost/api/analise-ativos/alvos/${t}`;
const ctx = (ticker = 'WEGE3') => ({ params: Promise.resolve({ ticker }) });
const put = (corpo: unknown, t = 'WEGE3') =>
  new NextRequest(urlDe(t), {
    method: 'PUT',
    body: JSON.stringify(corpo),
    headers: { 'Content-Type': 'application/json' },
  });
const del = (t = 'WEGE3') => new NextRequest(urlDe(t), { method: 'DELETE' });
const get = (t = 'WEGE3') => new NextRequest(urlDe(t));

const asset = (id: string, symbol: string, type: string) => ({
  id,
  symbol,
  name: symbol,
  type,
  currency: 'BRL',
  source: 'brapi',
  categoria: null,
  subcategoria: null,
});
const ASSETS: Record<string, ReturnType<typeof asset>> = {
  WEGE3: asset('a-wege', 'WEGE3', 'stock'),
  ITUB4: asset('a-itub', 'ITUB4', 'stock'),
  HGLG11: asset('a-hglg', 'HGLG11', 'fii'),
  AFHI11: asset('a-afhi', 'AFHI11', 'fii'),
  TSLA34: asset('a-tsla', 'TSLA34', 'opcao'),
};

interface Linha {
  id: string;
  userId: string;
  assetId: string;
  objetivo: number;
  categoriaOverride: string | null;
  [k: string]: unknown;
}
/** Banco fake: Portfolio e Watchlist por (userId, assetId). */
let portfolios: Linha[];
let watchlists: Linha[];

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

type WhereUA = { where: { userId: string; assetId: string } };
/** Cópia, como o Prisma (o objeto lido não muda com o update seguinte). */
const acha = (lista: Linha[], { where }: WhereUA) => {
  const l = lista.find((x) => x.userId === where.userId && x.assetId === where.assetId);
  return l ? { ...l } : null;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
  portfolios = [
    {
      id: 'pf-wege',
      userId: 'u1',
      assetId: 'a-wege',
      objetivo: 0,
      categoriaOverride: null,
      estrategia: 'growth',
      tipoFii: null,
      regiaoEtf: null,
      tipoFundo: null,
    },
  ];
  watchlists = [
    {
      id: 'wl-hglg',
      userId: 'u1',
      assetId: 'a-hglg',
      objetivo: 5,
      secao: 'tijolo',
      categoriaOverride: null,
      notes: null,
    },
  ];
  mocks.prisma.asset.findUnique.mockImplementation(
    async ({ where }: { where: { symbol: string } }) => ASSETS[where.symbol] ?? null,
  );
  mocks.prisma.portfolio.findFirst.mockImplementation(async (a: WhereUA) => acha(portfolios, a));
  mocks.prisma.watchlist.findFirst.mockImplementation(async (a: WhereUA) => acha(watchlists, a));
  mocks.prisma.portfolio.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: { objetivo: number } }) => {
      const l = portfolios.find((p) => p.id === where.id)!;
      Object.assign(l, data);
      return { ...l };
    },
  );
  mocks.prisma.watchlist.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: { objetivo: number } }) => {
      const l = watchlists.find((w) => w.id === where.id)!;
      Object.assign(l, data);
      return { ...l };
    },
  );
  mocks.prisma.watchlist.create.mockImplementation(
    async ({ data }: { data: Omit<Linha, 'id' | 'categoriaOverride'> }) => {
      const l = { id: `wl-${data.assetId}`, categoriaOverride: null, ...data } as Linha;
      watchlists.push(l);
      return { ...l };
    },
  );
  mocks.prisma.watchlist.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const i = watchlists.findIndex((w) => w.id === where.id);
    return watchlists.splice(i, 1)[0];
  });
  comoUsuario('u1');
});

describe('GET /api/analise-ativos/alvos/[ticker] — Objetivo da Carteira', () => {
  it('com posição: Portfolio.objetivo, aba e seção da posição (no-store)', async () => {
    portfolios[0].objetivo = 15;
    const res = await GET(get(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      ticker: 'WEGE3',
      alvo: {
        origem: 'posicao',
        id: 'pf-wege',
        objetivoPct: 15,
        categoria: 'acoes',
        abaNome: 'Ações',
        secao: 'growth',
      },
    });
  });

  it('sem posição, com linha planejada: o objetivo do planejado', async () => {
    const corpo = await (await GET(get('HGLG11'), ctx('HGLG11'))).json();
    expect(corpo.alvo).toMatchObject({
      origem: 'planejado',
      id: 'wl-hglg',
      objetivoPct: 5,
      categoria: 'fiis',
      secao: 'tijolo',
    });
  });

  it('sem posição nem plano: alvo null; não lê planning_asset_targets', async () => {
    expect(await (await GET(get('ITUB4'), ctx('ITUB4'))).json()).toEqual({
      ticker: 'ITUB4',
      alvo: null,
    });
    expect(mocks.prisma.planningAssetTarget.findUnique).not.toHaveBeenCalled();
  });

  it('ticker em minúsculas é normalizado; sem Asset ou inválido → 404', async () => {
    expect((await GET(get(), ctx('wege3'))).status).toBe(200);
    expect((await GET(get(), ctx('ZZZZ3'))).status).toBe(404);
    expect((await GET(get(), ctx('../x'))).status).toBe(404);
  });

  it('sem sessão → 401', async () => {
    mocks.requireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await GET(get(), ctx())).status).toBe(401);
  });

  it('flag desligada → 404 antes da sessão', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', '');
    expect((await GET(get(), ctx())).status).toBe(404);
    expect(mocks.requireAuthWithActing).not.toHaveBeenCalled();
  });

  it('fora do beta → 404', async () => {
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    comoUsuario('u-fora');
    limparCacheAcessoAnalise('u-fora');
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'user', featureBetas: [] });
    expect((await GET(get(), ctx())).status).toBe(404);
    expect(mocks.prisma.portfolio.findFirst).not.toHaveBeenCalled();
  });
});

describe('PUT — grava o Objetivo da aba', () => {
  it('com posição: Portfolio.objetivo (2 casas), histórico objetivo-classe e contexto', async () => {
    const r = await PUT(put({ objetivoPct: 10.126 }), ctx());
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({
      ticker: 'WEGE3',
      criado: false,
      alvo: { origem: 'posicao', id: 'pf-wege', objetivoPct: 10.13, abaNome: 'Ações' },
    });
    expect(mocks.prisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: 'pf-wege' },
      data: { objetivo: 10.13 },
    });
    expect(mocks.prisma.watchlist.create).not.toHaveBeenCalled();
    expect(mocks.recordObjetivoClasseDefinido).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetUserId: 'u1' }),
      {
        classe: 'Ações',
        ativoId: 'pf-wege',
        ticker: 'WEGE3',
        objetivoAnterior: 0,
        objetivo: 10.13,
      },
    );
    expect(mocks.invalidarContextoUsuario).toHaveBeenCalledWith('u1');
    // nunca mais planning_asset_targets
    expect(mocks.prisma.planningAssetTarget.upsert).not.toHaveBeenCalled();
  });

  it('com planejado: atualiza Watchlist.objetivo (histórico planejado.editar); seção mantida', async () => {
    const r = await PUT(put({ objetivoPct: 10, secao: 'tvm' }), ctx('HGLG11'));
    expect((await r.json()).alvo).toMatchObject({
      origem: 'planejado',
      objetivoPct: 10,
      secao: 'tijolo',
    });
    expect(mocks.prisma.watchlist.update).toHaveBeenCalledWith({
      where: { id: 'wl-hglg' },
      data: { objetivo: 10 },
    });
    expect(mocks.recordPlanejadoEditado).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('caso do Pedro: AFHI11 sem posição → nasce o planejado na aba FIIs, seção Papel (tvm)', async () => {
    const r = await PUT(put({ objetivoPct: 10, secao: 'tvm' }, 'AFHI11'), ctx('AFHI11'));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({
      ticker: 'AFHI11',
      criado: true,
      alvo: { origem: 'planejado', objetivoPct: 10, categoria: 'fiis', secao: 'tvm' },
    });
    expect(mocks.prisma.watchlist.create).toHaveBeenCalledWith({
      data: { userId: 'u1', assetId: 'a-afhi', objetivo: 10, secao: 'tvm', notes: null },
    });
    expect(mocks.recordPlanejadoAdicionado).toHaveBeenCalledTimes(1);
    expect(mocks.invalidarContextoUsuario).toHaveBeenCalledWith('u1');
    // idempotente: a 2ª gravação atualiza a linha criada, não cria outra
    await PUT(put({ objetivoPct: 12 }, 'AFHI11'), ctx('AFHI11'));
    expect(mocks.prisma.watchlist.create).toHaveBeenCalledTimes(1);
    expect(watchlists.filter((w) => w.assetId === 'a-afhi')).toHaveLength(1);
    expect(watchlists.find((w) => w.assetId === 'a-afhi')?.objetivo).toBe(12);
  });

  it('sem seção: padrão da aba (ação → value; FII → tvm)', async () => {
    await PUT(put({ objetivoPct: 4 }, 'ITUB4'), ctx('ITUB4'));
    expect(mocks.prisma.watchlist.create.mock.calls[0][0].data.secao).toBe('value');
    await PUT(put({ objetivoPct: 4 }, 'AFHI11'), ctx('AFHI11'));
    expect(mocks.prisma.watchlist.create.mock.calls[1][0].data.secao).toBe('tvm');
  });

  it('seção fora da aba → 400 e nada gravado; tipo sem aba planejável → 400', async () => {
    expect(
      (await PUT(put({ objetivoPct: 4, secao: 'tijolo' }, 'ITUB4'), ctx('ITUB4'))).status,
    ).toBe(400);
    expect((await PUT(put({ objetivoPct: 4 }, 'TSLA34'), ctx('TSLA34'))).status).toBe(400);
    expect(mocks.prisma.watchlist.create).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', { objetivoPct: 0 }],
    ['negativo', { objetivoPct: -1 }],
    ['acima de 100', { objetivoPct: 100.5 }],
    ['texto', { objetivoPct: '6' }],
    ['campo antigo', { targetPct: 6 }],
    ['campo extra', { objetivoPct: 6, objetivo: 6 }],
    ['vazio', {}],
  ])('PUT %s → 400 e nada gravado', async (_n, corpo) => {
    const r = await PUT(put(corpo), ctx());
    expect(r.status).toBe(400);
    expect(mocks.prisma.portfolio.update).not.toHaveBeenCalled();
    expect(mocks.prisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('PUT com JSON inválido → 400; ticker sem Asset → 404; aceita 100', async () => {
    const req = new NextRequest(urlDe('WEGE3'), { method: 'PUT', body: '{' });
    expect((await PUT(req, ctx())).status).toBe(400);
    expect((await PUT(put({ objetivoPct: 5 }), ctx('ZZZZ3'))).status).toBe(404);
    expect((await PUT(put({ objetivoPct: 100 }), ctx())).status).toBe(200);
  });

  it('IDOR: o u2 grava só no u2 (cria o planejado dele), sem tocar a posição do u1', async () => {
    comoUsuario('u2');
    await PUT(put({ objetivoPct: 9 }), ctx());
    expect(portfolios[0].objetivo).toBe(0);
    expect(mocks.prisma.watchlist.create.mock.calls[0][0].data.userId).toBe('u2');
  });
});

describe('DELETE — "Remover do plano"', () => {
  it('posição: objetivo volta a 0, com histórico; sem objetivo → removido=false', async () => {
    portfolios[0].objetivo = 15;
    const r = await DELETE(del(), ctx());
    expect(await r.json()).toEqual({ ticker: 'WEGE3', removido: true, origem: 'posicao' });
    expect(portfolios[0].objetivo).toBe(0);
    expect(mocks.recordObjetivoClasseDefinido).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ objetivoAnterior: 15, objetivo: 0 }),
    );
    const r2 = await DELETE(del(), ctx());
    expect(await r2.json()).toEqual({ ticker: 'WEGE3', removido: false, origem: 'posicao' });
  });

  it('planejado: apaga a linha (o × da Carteira), com histórico planejado.remover', async () => {
    const r = await DELETE(del('HGLG11'), ctx('HGLG11'));
    expect(await r.json()).toEqual({ ticker: 'HGLG11', removido: true, origem: 'planejado' });
    expect(mocks.prisma.watchlist.delete).toHaveBeenCalledWith({ where: { id: 'wl-hglg' } });
    expect(mocks.recordPlanejadoRemovido).toHaveBeenCalledTimes(1);
    expect(mocks.invalidarContextoUsuario).toHaveBeenCalledWith('u1');
  });

  it('nada a remover: 200 com removido=false e origem null', async () => {
    const r = await DELETE(del('ITUB4'), ctx('ITUB4'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ticker: 'ITUB4', removido: false, origem: null });
    expect(mocks.prisma.planningAssetTarget.deleteMany).not.toHaveBeenCalled();
  });
});

describe('consultor agindo pelo cliente', () => {
  it('grava no cliente, com log do acesso e o auth do consultor no histórico', async () => {
    comoConsultor();
    const r = await PUT(put({ objetivoPct: 4 }, 'ITUB4'), ctx('ITUB4'));
    expect(r.status).toBe(200);
    expect(mocks.prisma.watchlist.create.mock.calls[0][0].data.userId).toBe('u1');
    expect(mocks.recordPlanejadoAdicionado).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'c1' }),
        targetUserId: 'u1',
      }),
      expect.anything(),
      expect.anything(),
    );
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
    portfolios[0].objetivo = 8;
    const g = await GET(get(), ctx());
    expect((await g.json()).alvo.objetivoPct).toBe(8);
    await DELETE(del(), ctx());
    expect(portfolios[0].objetivo).toBe(0);
    expect(mocks.logSensitiveEndpointAccess).toHaveBeenCalledTimes(2);
  });

  it('usuário comum: sem log', async () => {
    await PUT(put({ objetivoPct: 3 }), ctx());
    expect(mocks.logSensitiveEndpointAccess).not.toHaveBeenCalled();
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
