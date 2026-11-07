import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';
import { ASSINATURA_ME_DESLIGADA } from '@/types/assinatura';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  userConsent: { create: vi.fn() },
  assinatura: { findUnique: vi.fn() },
}));
const mockAuth = vi.hoisted(() => vi.fn());
const svc = vi.hoisted(() => ({
  criarSessaoCheckout: vi.fn(),
  criarSessaoPortal: vi.fn(),
  montarAssinaturaMe: vi.fn(),
  sincronizarSessaoDoDono: vi.fn(),
  registrarArrependimento: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockAuth }));
vi.mock('@/services/assinaturas/checkout', () => ({ ...svc, VERSAO_TERMOS_VENDA: '2.0' }));

import { POST as checkout } from '../checkout/route';
import { POST as portal } from '../portal/route';
import { GET as me } from '../me/route';
import { POST as arrependimento } from '../arrependimento/route';

const DONO = {
  payload: { id: 'user-1', role: 'user' },
  targetUserId: 'user-1',
  actingClient: null,
};
const CONSULTOR = {
  payload: { id: 'consultor-1', role: 'consultant' },
  targetUserId: 'user-1',
  actingClient: { id: 'user-1', name: 'Cliente', email: 'c@x.com' },
};

const post = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest', 'x-real-ip': '1.2.3.4' },
  });
const get = (path: string) => new NextRequest(`http://localhost${path}`);

const ACEITE = { plano: 'pro', intervalo: 'ano', aceiteTermos: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_local');
  mockAuth.mockResolvedValue(DONO);
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@x.com', name: 'U' });
  svc.criarSessaoCheckout.mockResolvedValue({ url: 'https://checkout', destino: 'checkout' });
  svc.criarSessaoPortal.mockResolvedValue({ url: 'https://portal' });
  svc.montarAssinaturaMe.mockResolvedValue({ plano: 'pro', habilitado: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('chave desligada', () => {
  beforeEach(() => vi.stubEnv('ASSINATURAS_HABILITADAS', ''));

  it('checkout, portal e arrependimento: 404 sem consultar nada', async () => {
    for (const res of [
      await checkout(post('/api/assinaturas/checkout', ACEITE)),
      await portal(post('/api/assinaturas/portal')),
      await arrependimento(post('/api/assinaturas/arrependimento')),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockPrisma.userConsent.create).not.toHaveBeenCalled();
    expect(svc.criarSessaoCheckout).not.toHaveBeenCalled();
  });

  it('/me devolve ASSINATURA_ME_DESLIGADA (adv) sem Stripe nem tabelas novas', async () => {
    const res = await me(get('/api/assinaturas/me?session_id=cs_test_abc'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ASSINATURA_ME_DESLIGADA);
    expect(svc.sincronizarSessaoDoDono).not.toHaveBeenCalled();
    expect(svc.montarAssinaturaMe).not.toHaveBeenCalled();
  });

  it('só STRIPE_SECRET_KEY sem o webhook secret também conta como desligada', async () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect((await checkout(post('/api/assinaturas/checkout', ACEITE))).status).toBe(404);
  });
});

describe('POST /api/assinaturas/checkout', () => {
  it('com aceite: grava UserConsent terms-of-sale e cria a sessão com o userId do requisitante', async () => {
    const res = await checkout(post('/api/assinaturas/checkout', ACEITE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout', destino: 'checkout' });
    expect(mockPrisma.userConsent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        documentType: 'terms-of-sale',
        documentVersion: '2.0',
        ipAddress: '1.2.3.4',
        userAgent: 'vitest',
      },
    });
    expect(svc.criarSessaoCheckout).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
      plano: 'pro',
      intervalo: 'ano',
    });
    expect(mockPrisma.userConsent.create.mock.invocationCallOrder[0]).toBeLessThan(
      svc.criarSessaoCheckout.mock.invocationCallOrder[0],
    );
  });

  it('sem aceite: 400 e nada gravado', async () => {
    for (const body of [
      { plano: 'pro', intervalo: 'mes' },
      { plano: 'pro', intervalo: 'mes', aceiteTermos: false },
    ]) {
      const res = await checkout(post('/api/assinaturas/checkout', body));
      expect(res.status).toBe(400);
    }
    expect(mockPrisma.userConsent.create).not.toHaveBeenCalled();
    expect(svc.criarSessaoCheckout).not.toHaveBeenCalled();
  });

  it('plano ou intervalo inválido (basic, semana): 400', async () => {
    const r1 = await checkout(post('/api/assinaturas/checkout', { ...ACEITE, plano: 'basic' }));
    const r2 = await checkout(
      post('/api/assinaturas/checkout', { ...ACEITE, intervalo: 'semana' }),
    );
    expect([r1.status, r2.status]).toEqual([400, 400]);
  });

  it('consultor agindo pelo cliente: 403 (nunca compra no nome do cliente)', async () => {
    mockAuth.mockResolvedValue(CONSULTOR);
    const res = await checkout(post('/api/assinaturas/checkout', ACEITE));
    expect(res.status).toBe(403);
    expect(svc.criarSessaoCheckout).not.toHaveBeenCalled();
  });

  it('erro do serviço (503 Price ausente) chega como JSON', async () => {
    svc.criarSessaoCheckout.mockRejectedValue(new ApiError(503, 'indisponível'));
    const res = await checkout(post('/api/assinaturas/checkout', ACEITE));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'indisponível' });
  });
});

describe('POST /api/assinaturas/portal', () => {
  it('com Customer: devolve a url do Portal', async () => {
    mockPrisma.assinatura.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    const res = await portal(post('/api/assinaturas/portal'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://portal' });
    expect(mockPrisma.assinatura.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { stripeCustomerId: true },
    });
    expect(svc.criarSessaoPortal).toHaveBeenCalledWith('cus_1');
  });

  it('sem Customer: 409', async () => {
    mockPrisma.assinatura.findUnique.mockResolvedValue(null);
    expect((await portal(post('/api/assinaturas/portal'))).status).toBe(409);
  });

  it('consultor agindo pelo cliente: 403', async () => {
    mockAuth.mockResolvedValue(CONSULTOR);
    expect((await portal(post('/api/assinaturas/portal'))).status).toBe(403);
    expect(svc.criarSessaoPortal).not.toHaveBeenCalled();
  });
});

describe('GET /api/assinaturas/me', () => {
  it('sem session_id: só monta o estado', async () => {
    const res = await me(get('/api/assinaturas/me'));
    expect(await res.json()).toEqual({ plano: 'pro', habilitado: true });
    expect(svc.sincronizarSessaoDoDono).not.toHaveBeenCalled();
    expect(svc.montarAssinaturaMe).toHaveBeenCalledWith({
      userId: 'user-1',
      requisitanteId: 'user-1',
    });
  });

  it('com session_id: pede a sincronização do PRÓPRIO requisitante antes de montar', async () => {
    await me(get('/api/assinaturas/me?session_id=cs_test_abc'));
    expect(svc.sincronizarSessaoDoDono).toHaveBeenCalledWith('user-1', 'cs_test_abc');
    expect(svc.sincronizarSessaoDoDono.mock.invocationCallOrder[0]).toBeLessThan(
      svc.montarAssinaturaMe.mock.invocationCallOrder[0],
    );
  });

  it('consultor agindo pelo cliente: nunca sincroniza, estado do cliente para leitura', async () => {
    mockAuth.mockResolvedValue(CONSULTOR);
    await me(get('/api/assinaturas/me?session_id=cs_test_abc'));
    expect(svc.sincronizarSessaoDoDono).not.toHaveBeenCalled();
    expect(svc.montarAssinaturaMe).toHaveBeenCalledWith({
      userId: 'user-1',
      requisitanteId: 'consultor-1',
    });
  });
});

describe('POST /api/assinaturas/arrependimento', () => {
  it('novo pedido: 201 com o protocolo', async () => {
    svc.registrarArrependimento.mockResolvedValue({ protocolo: 'ped_1', novo: true });
    const res = await arrependimento(post('/api/assinaturas/arrependimento'));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ protocolo: 'ped_1' });
    expect(svc.registrarArrependimento).toHaveBeenCalledWith('user-1');
  });

  it('pedido repetido: 200', async () => {
    svc.registrarArrependimento.mockResolvedValue({ protocolo: 'ped_1', novo: false });
    expect((await arrependimento(post('/api/assinaturas/arrependimento'))).status).toBe(200);
  });

  it('depois dos 7 dias: 409', async () => {
    svc.registrarArrependimento.mockRejectedValue(new ApiError(409, 'O prazo terminou'));
    expect((await arrependimento(post('/api/assinaturas/arrependimento'))).status).toBe(409);
  });

  it('consultor agindo pelo cliente: 403', async () => {
    mockAuth.mockResolvedValue(CONSULTOR);
    expect((await arrependimento(post('/api/assinaturas/arrependimento'))).status).toBe(403);
    expect(svc.registrarArrependimento).not.toHaveBeenCalled();
  });
});
