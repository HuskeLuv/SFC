import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    analiseCenario: {
      findUnique: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  requireAuthWithActing: vi.fn(),
  obterBaseCenarios: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/analiseAtivos/leitura/ativo/baseCenarios', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/ativo/baseCenarios')>();
  return { ...real, obterBaseCenarios: mocks.obterBaseCenarios };
});
vi.mock('jose', () => ({ jwtVerify: mocks.jwtVerify }));
vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');

import { DELETE, GET, PUT } from '../route';
import { limparCacheAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { montarBaseCenarios } from '@/services/analiseAtivos/leitura/ativo/baseCenarios';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { MAX_CENARIOS_POR_USUARIO } from '@/services/analiseAtivos/cenarios/contrato';
import { middleware } from '@/middleware';
import { CSRF_COOKIE_NAME } from '@/utils/csrf';
import { LINHA_HGLG11, LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { CenariosResposta } from '@/types/analiseAtivosBlocoD';

const URL_BASE = 'http://localhost/api/analise-ativos/cenarios/';
const ctx = (ticker = 'WEGE3') => ({ params: Promise.resolve({ ticker }) });
const get = (t = 'WEGE3') => GET(new NextRequest(URL_BASE + t), ctx(t));
const put = (corpo: unknown, t = 'WEGE3') =>
  PUT(
    new NextRequest(URL_BASE + t, {
      method: 'PUT',
      body: JSON.stringify(corpo),
      headers: { 'Content-Type': 'application/json' },
    }),
    ctx(t),
  );
const del = (t = 'WEGE3') => DELETE(new NextRequest(URL_BASE + t, { method: 'DELETE' }), ctx(t));

const ATUALIZADO = new Date('2026-10-08T14:32:00Z');
const PREMISSAS_ACAO = { yieldPct: 4, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 };

const BASE_WEGE = montarBaseCenarios({
  linha: paraLinhaQuadroApi(LINHA_WEGE3),
  atual: {
    lpaTtm: 1.49,
    vpa: 4.5,
    dpa12m: 2,
    rend12m: null,
    vpCota: null,
    pvp: 11.2,
    plMedia10a: 36.9,
    plPontosHistorico: 10,
    flags: [],
  },
  versao: 'v1',
});
const BASE_HGLG = montarBaseCenarios({
  linha: paraLinhaQuadroApi(LINHA_HGLG11),
  atual: {
    lpaTtm: null,
    vpa: null,
    dpa12m: null,
    rend12m: 13.34,
    vpCota: 165.95,
    pvp: 0.89,
    plMedia10a: null,
    plPontosHistorico: 0,
    flags: [],
  },
  versao: 'v1',
});

type Linha = {
  userId: string;
  symbol: string;
  classe: string;
  premissas: unknown;
  dadosEditados: unknown;
  updatedAt: Date;
};
/** Banco fake: cenários por (userId, symbol). */
let cenarios: Map<string, Linha>;
const chave = (userId: string, symbol: string) => `${userId}|${symbol}`;
type Where = { where: { userId_symbol: { userId: string; symbol: string } } };

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
  vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
  vi.stubEnv('ANALISE_ATIVOS_CENARIOS_HABILITADO', 'true');
  cenarios = new Map([
    [
      chave('u1', 'WEGE3'),
      {
        userId: 'u1',
        symbol: 'WEGE3',
        classe: 'acao',
        premissas: PREMISSAS_ACAO,
        dadosEditados: { valores: { lpa: 1.44 }, valoresDoAtivoNoSalvamento: { lpa: 1.4 } },
        updatedAt: ATUALIZADO,
      },
    ],
  ]);
  mocks.obterBaseCenarios.mockImplementation(async (s: string) =>
    s === 'WEGE3' ? BASE_WEGE : s === 'HGLG11' ? BASE_HGLG : null,
  );
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mocks.prisma),
  );
  mocks.prisma.analiseCenario.findUnique.mockImplementation(
    async ({ where }: Where) =>
      cenarios.get(chave(where.userId_symbol.userId, where.userId_symbol.symbol)) ?? null,
  );
  mocks.prisma.analiseCenario.count.mockImplementation(
    async ({ where }: { where: { userId: string } }) =>
      [...cenarios.values()].filter((c) => c.userId === where.userId).length,
  );
  mocks.prisma.analiseCenario.upsert.mockImplementation(
    async ({ where, create }: Where & { create: Omit<Linha, 'updatedAt'> }) => {
      const k = chave(where.userId_symbol.userId, where.userId_symbol.symbol);
      cenarios.set(k, { ...create, updatedAt: ATUALIZADO });
      return { updatedAt: ATUALIZADO };
    },
  );
  mocks.prisma.analiseCenario.deleteMany.mockImplementation(
    async ({ where }: { where: { userId: string; symbol: string } }) => {
      const existia = cenarios.delete(chave(where.userId, where.symbol));
      return { count: existia ? 1 : 0 };
    },
  );
  comoUsuario('u1');
});

describe('GET /api/analise-ativos/cenarios/[ticker]', () => {
  it('base do ativo + cenário salvo do usuário logado, no-store', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const r = (await res.json()) as CenariosResposta;
    expect(r).toMatchObject({
      ticker: 'WEGE3',
      classe: 'acao',
      podeSalvar: true,
      motivoSemSalvar: null,
      premissasPadrao: { yieldPct: 6, plAlvo: 36.9 },
    });
    expect(r.salvo).toEqual({
      premissas: PREMISSAS_ACAO,
      dadosEditados: { lpa: 1.44 },
      atualizadoEm: ATUALIZADO.toISOString(),
      valoresDoAtivoNoSalvamento: { lpa: 1.4 },
    });
  });

  it('sem cenário: salvo = null', async () => {
    const r = (await (await get('HGLG11')).json()) as CenariosResposta;
    expect(r.classe).toBe('fii');
    expect(r.salvo).toBeNull();
  });

  it('isolamento: o u2 nunca lê o cenário do u1 (consulta presa ao payload.id)', async () => {
    comoUsuario('u2');
    const r = (await (await get()).json()) as CenariosResposta;
    expect(r.salvo).toBeNull();
    expect(mocks.prisma.analiseCenario.findUnique.mock.calls[0][0].where).toEqual({
      userId_symbol: { userId: 'u2', symbol: 'WEGE3' },
    });
  });

  it('consultor agindo: 200 com a base, salvo = null, podeSalvar = false, sem ler cenário', async () => {
    comoConsultor();
    const res = await get();
    expect(res.status).toBe(200);
    const r = (await res.json()) as CenariosResposta;
    expect(r).toMatchObject({ salvo: null, podeSalvar: false, motivoSemSalvar: 'consultor' });
    expect(r.classe === 'acao' && r.base.lpa).toEqual({ estado: 'ok', valor: 1.49 });
    expect(mocks.prisma.analiseCenario.findUnique).not.toHaveBeenCalled();
  });

  it('ticker minúsculo normaliza; inválido ou fora da área → 404', async () => {
    expect((await GET(new NextRequest(URL_BASE + 'wege3'), ctx('wege3'))).status).toBe(200);
    expect((await get('ZZZZ3')).status).toBe(404);
    expect((await GET(new NextRequest(URL_BASE + 'x'), ctx('../x'))).status).toBe(404);
    expect((await GET(new NextRequest(URL_BASE + 'x'), ctx('%E0%A4%A'))).status).toBe(404);
  });

  it('flag de cenários desligada → 404 antes da sessão', async () => {
    vi.stubEnv('ANALISE_ATIVOS_CENARIOS_HABILITADO', '');
    expect((await get()).status).toBe(404);
    expect((await put({ classe: 'acao', premissas: PREMISSAS_ACAO })).status).toBe(404);
    expect((await del()).status).toBe(404);
    expect(mocks.requireAuthWithActing).not.toHaveBeenCalled();
  });

  it('área desligada → 404; fora do beta → 404', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', '');
    expect((await get()).status).toBe(404);
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    comoUsuario('u-fora');
    limparCacheAcessoAnalise('u-fora');
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'user', featureBetas: [] });
    expect((await get()).status).toBe(404);
    expect(mocks.prisma.analiseCenario.findUnique).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mocks.requireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await get()).status).toBe(401);
  });
});

describe('PUT / DELETE', () => {
  it('PUT grava só os editados com o valor do ativo; GET devolve; restaurar apaga', async () => {
    const r1 = await put({
      classe: 'acao',
      premissas: { ...PREMISSAS_ACAO, yieldPct: 4 },
      dados: { dpa: 1.8 },
    });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ atualizadoEm: ATUALIZADO.toISOString() });
    expect(cenarios.get(chave('u1', 'WEGE3'))?.dadosEditados).toEqual({
      valores: { dpa: 1.8 },
      valoresDoAtivoNoSalvamento: { dpa: 2 },
    });
    const r = (await (await get()).json()) as CenariosResposta;
    expect(r.salvo?.premissas.yieldPct).toBe(4);
    const d = await del();
    expect(await d.json()).toEqual({ ok: true });
    expect(cenarios.has(chave('u1', 'WEGE3'))).toBe(false);
    expect(((await (await get()).json()) as CenariosResposta).salvo).toBeNull();
  });

  it('PUT sem dados grava dadosEditados nulo; P/L alvo vazio (null) é aceito', async () => {
    const r = await put({ classe: 'acao', premissas: { ...PREMISSAS_ACAO, plAlvo: null } });
    expect(r.status).toBe(200);
    const linha = cenarios.get(chave('u1', 'WEGE3'));
    expect(linha?.premissas).toMatchObject({ plAlvo: null });
    expect(String(linha?.dadosEditados)).toMatch(/null/i);
  });

  it('DELETE é idempotente', async () => {
    expect((await del('HGLG11')).status).toBe(200);
    expect((await del('HGLG11')).status).toBe(200);
  });

  it('isolamento: PUT/DELETE do u2 não tocam o do u1', async () => {
    comoUsuario('u2');
    await put({ classe: 'acao', premissas: PREMISSAS_ACAO });
    await del();
    expect(cenarios.get(chave('u1', 'WEGE3'))?.premissas).toEqual(PREMISSAS_ACAO);
    expect(mocks.prisma.analiseCenario.deleteMany.mock.calls[0][0].where).toEqual({
      userId: 'u2',
      symbol: 'WEGE3',
    });
  });

  it('400: zod (campo extra, margem fora do passo, string com vírgula, JSON inválido)', async () => {
    const ruins = [
      { classe: 'acao', premissas: PREMISSAS_ACAO, extra: 1 },
      { classe: 'acao', premissas: { ...PREMISSAS_ACAO, margemPct: 22 } },
      { classe: 'acao', premissas: { ...PREMISSAS_ACAO, yieldPct: '6,5' } },
      { classe: 'acao', premissas: { ...PREMISSAS_ACAO, yieldPct: 45 } },
      { classe: 'acao', premissas: PREMISSAS_ACAO, dados: { lpa: 1e9 } },
    ];
    for (const b of ruins) expect((await put(b)).status).toBe(400);
    const req = new NextRequest(URL_BASE + 'WEGE3', { method: 'PUT', body: '{' });
    expect((await PUT(req, ctx())).status).toBe(400);
    expect(mocks.prisma.analiseCenario.upsert).not.toHaveBeenCalled();
  });

  it('400: classe do corpo ≠ classe do ativo', async () => {
    const r = await put(
      { classe: 'fii', premissas: { yieldPct: 8, margemPct: 10, rendaMensal: 1000, pvpAlvo: 1 } },
      'WEGE3',
    );
    expect(r.status).toBe(400);
    expect(mocks.prisma.analiseCenario.upsert).not.toHaveBeenCalled();
  });

  it('409 na criação do 301º; atualizar um existente continua valendo', async () => {
    cenarios = new Map(
      Array.from({ length: MAX_CENARIOS_POR_USUARIO }, (_, i) => {
        const symbol = i === 0 ? 'WEGE3' : `TST${i}`;
        return [
          chave('u1', symbol),
          {
            userId: 'u1',
            symbol,
            classe: 'acao',
            premissas: PREMISSAS_ACAO,
            dadosEditados: null,
            updatedAt: ATUALIZADO,
          },
        ];
      }),
    );
    const novo = await put(
      { classe: 'fii', premissas: { yieldPct: 8, margemPct: 10, rendaMensal: 1000, pvpAlvo: 1 } },
      'HGLG11',
    );
    expect(novo.status).toBe(409);
    expect((await novo.json()).error).toMatch(/limite de 300 cenários/);
    expect((await put({ classe: 'acao', premissas: PREMISSAS_ACAO })).status).toBe(200);
  });

  it('consultor agindo: PUT e DELETE → 403, nada gravado nem apagado', async () => {
    comoConsultor();
    const p = await put({ classe: 'acao', premissas: PREMISSAS_ACAO });
    expect(p.status).toBe(403);
    expect((await p.json()).error).toBe('Os cenários salvos são pessoais');
    expect((await del()).status).toBe(403);
    expect(mocks.prisma.analiseCenario.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.analiseCenario.deleteMany).not.toHaveBeenCalled();
  });
});

describe('CSRF (middleware) na rota dos cenários', () => {
  const CSRF = 'a'.repeat(64);
  const pelaBorda = (method: string, headers: Record<string, string> = {}) => {
    const req = new NextRequest(new URL('/api/analise-ativos/cenarios/WEGE3', 'http://localhost'), {
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
