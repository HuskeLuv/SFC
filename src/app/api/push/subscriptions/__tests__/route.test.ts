import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  prisma: {
    pushSubscription: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock('@/utils/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { GET, POST, DELETE } from '../route';
import { DELETE as DELETE_BY_ID } from '../[id]/route';

const ENDPOINT = 'https://push.example/abc';

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/push/subscriptions', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const corpoValido = {
  endpoint: ENDPOINT,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile Safari/537.36',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Rotas de push usam a SESSÃO (requireSession) — o cookie de acting do
  // consultor é ignorado por construção: nada aqui lê requireAuthWithActing.
  mocks.requireSession.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'user' });
  mocks.prisma.pushSubscription.upsert.mockResolvedValue({});
  mocks.prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
  vi.stubEnv('WEB_PUSH_HABILITADO', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/push/subscriptions', () => {
  it('upsert por endpoint, reassociando ao usuário da sessão → 204', async () => {
    const res = await POST(req('POST', corpoValido));
    expect(res.status).toBe(204);
    expect(mocks.prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT },
      create: {
        userId: 'u1',
        endpoint: ENDPOINT,
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        userAgent: corpoValido.userAgent,
      },
      update: {
        userId: 'u1',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        userAgent: corpoValido.userAgent,
      },
    });
  });

  it('rejeita endpoint que não é https e corpo sem keys', async () => {
    expect(
      (await POST(req('POST', { ...corpoValido, endpoint: 'http://push.example/abc' }))).status,
    ).toBe(400);
    expect((await POST(req('POST', { endpoint: ENDPOINT }))).status).toBe(400);
    expect(mocks.prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('com o push desligado responde 503', async () => {
    vi.stubEnv('WEB_PUSH_HABILITADO', 'false');
    expect((await POST(req('POST', corpoValido))).status).toBe(503);
  });
});

describe('GET /api/push/subscriptions', () => {
  it('lista só os aparelhos do usuário da sessão, com rótulo do user-agent', async () => {
    mocks.prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's1',
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile Safari/537.36',
        createdAt: new Date('2026-09-29T12:00:00Z'),
        endpoint: ENDPOINT,
      },
      {
        id: 's2',
        userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/18 Safari/605.1',
        createdAt: new Date('2026-09-28T12:00:00Z'),
        endpoint: 'https://push.example/def',
      },
      {
        id: 's3',
        userAgent: null,
        createdAt: new Date('2026-09-27T12:00:00Z'),
        endpoint: 'https://push.example/ghi',
      },
    ]);

    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    expect(mocks.prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    const { subscriptions } = await res.json();
    expect(subscriptions).toEqual([
      {
        id: 's1',
        rotulo: 'Chrome · celular',
        criadoEm: '2026-09-29T12:00:00.000Z',
        endpoint: ENDPOINT,
      },
      {
        id: 's2',
        rotulo: 'Safari · computador',
        criadoEm: '2026-09-28T12:00:00.000Z',
        endpoint: 'https://push.example/def',
      },
      {
        id: 's3',
        rotulo: 'Aparelho desconhecido',
        criadoEm: '2026-09-27T12:00:00.000Z',
        endpoint: 'https://push.example/ghi',
      },
    ]);
  });
});

describe('DELETE /api/push/subscriptions (por endpoint)', () => {
  it('remove a assinatura deste aparelho, restrita ao dono → 204', async () => {
    const res = await DELETE(req('DELETE', { endpoint: ENDPOINT }));
    expect(res.status).toBe(204);
    expect(mocks.prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT, userId: 'u1' },
    });
  });

  it('corpo sem endpoint válido responde 400', async () => {
    expect((await DELETE(req('DELETE', { endpoint: 'nada' }))).status).toBe(400);
  });
});

describe('DELETE /api/push/subscriptions/[id]', () => {
  const params = { params: Promise.resolve({ id: 's1' }) };

  it('apaga o aparelho remoto do próprio usuário → 204', async () => {
    const res = await DELETE_BY_ID(req('DELETE'), params);
    expect(res.status).toBe(204);
    expect(mocks.prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: 's1', userId: 'u1' },
    });
  });

  it('assinatura de OUTRO usuário responde 404 sem vazar existência', async () => {
    mocks.prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE_BY_ID(req('DELETE'), params);
    expect(res.status).toBe(404);
  });
});
