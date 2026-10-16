import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  prisma: {
    pushPreferencia: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock('@/utils/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { GET, PATCH } from '../route';
import { limparCacheAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';

const req = (body?: unknown) =>
  new NextRequest('http://localhost/api/push/preferencias', {
    method: body === undefined ? 'GET' : 'PATCH',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  // Preferência é do dono da conta: rota usa requireSession (payload.id),
  // nunca requireAuthWithActing — o acting do consultor é ignorado.
  mocks.requireSession.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'user' });
  mocks.prisma.pushPreferencia.findUnique.mockResolvedValue(null);
  mocks.prisma.pushPreferencia.upsert.mockResolvedValue({});
  vi.stubEnv('WEB_PUSH_HABILITADO', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'chave-publica-vapid');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'chave-privada-vapid');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/push/preferencias', () => {
  it('sem registro = tudo ligado; chave pública VAPID viaja na resposta', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      habilitado: true,
      vapidPublicKey: 'chave-publica-vapid',
      categorias: { orcamento: true, agenda: true, comunidade: true, conta: true, analise: true },
      comunidadeVisivel: false,
      analiseVisivel: false,
    });
    expect(mocks.prisma.pushPreferencia.findUnique).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('devolve o que está gravado e expõe a comunidade quando a flag liga', async () => {
    vi.stubEnv('COMUNIDADE_HABILITADA', 'true');
    mocks.prisma.pushPreferencia.findUnique.mockResolvedValue({
      orcamento: false,
      agenda: true,
      comunidade: false,
      conta: true,
      analise: false,
    });
    expect(await (await GET(req())).json()).toEqual({
      habilitado: true,
      vapidPublicKey: 'chave-publica-vapid',
      categorias: {
        orcamento: false,
        agenda: true,
        comunidade: false,
        conta: true,
        analise: false,
      },
      comunidadeVisivel: true,
      analiseVisivel: false,
    });
  });

  it('push desligado: habilitado=false e a chave pública não sai', async () => {
    vi.stubEnv('WEB_PUSH_HABILITADO', 'false');
    const body = await (await GET(req())).json();
    expect(body.habilitado).toBe(false);
    expect(body.vapidPublicKey).toBeNull();
  });
});

describe('PATCH /api/push/preferencias', () => {
  it('parcial: cria a linha sob demanda só com o que veio', async () => {
    const res = await PATCH(req({ orcamento: false }));
    expect(res.status).toBe(204);
    expect(mocks.prisma.pushPreferencia.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', orcamento: false },
      update: { orcamento: false },
    });
  });

  it("aceita a categoria 'analise' (avisos das listas da Análise de Ativos)", async () => {
    expect((await PATCH(req({ analise: false }))).status).toBe(204);
    expect(mocks.prisma.pushPreferencia.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', analise: false },
      update: { analise: false },
    });
  });

  it('rejeita valor não booleano e campo fora do contrato', async () => {
    expect((await PATCH(req({ orcamento: 'sim' }))).status).toBe(400);
    expect((await PATCH(req({ marketing: true }))).status).toBe(400);
    expect(mocks.prisma.pushPreferencia.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/push/preferencias — analiseVisivel (bloco 1)', () => {
  const ligarAvisos = () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    vi.stubEnv('ANALISE_ATIVOS_SALVOS_HABILITADO', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ALERTAS_HABILITADO', 'true');
  };
  beforeEach(() => limparCacheAcessoAnalise('u1'));

  it('flags ligadas e usuário no beta → true', async () => {
    ligarAvisos();
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'user', featureBetas: [{ id: 'b' }] });
    expect((await (await GET(req())).json()).analiseVisivel).toBe(true);
  });

  it('fora do beta → false; ALERTAS sem SALVOS → false (sem consultar o banco)', async () => {
    ligarAvisos();
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'user', featureBetas: [] });
    expect((await (await GET(req())).json()).analiseVisivel).toBe(false);
    limparCacheAcessoAnalise('u1');
    vi.stubEnv('ANALISE_ATIVOS_SALVOS_HABILITADO', 'false');
    mocks.prisma.user.findUnique.mockClear();
    expect((await (await GET(req())).json()).analiseVisivel).toBe(false);
  });
});
