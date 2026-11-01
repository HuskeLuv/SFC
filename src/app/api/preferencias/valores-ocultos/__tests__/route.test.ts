import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@test.com', role: 'user' }),
);

vi.mock('@/utils/auth', () => ({ requireSession: mockRequireSession }));

import { POST } from '../route';

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/preferencias/valores-ocultos', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const setCookie = (res: Response) => res.headers.get('set-cookie') ?? '';

describe('POST /api/preferencias/valores-ocultos', () => {
  beforeEach(() => {
    vi.stubEnv('VALORES_OCULTOS_HABILITADO', 'true');
    mockRequireSession.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('liga: 200 e Set-Cookie de 1 ano, Path=/, SameSite=Lax, sem HttpOnly', async () => {
    const res = await POST(post({ ocultos: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ocultos: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cookie = setCookie(res);
    expect(cookie).toMatch(/^mf_valores_ocultos=1;/);
    expect(cookie).toMatch(/Max-Age=31536000/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(mockRequireSession).toHaveBeenCalledTimes(1);
  });

  it('Secure só em produção', async () => {
    expect(setCookie(await POST(post({ ocultos: true })))).not.toMatch(/Secure/i);
    vi.stubEnv('NODE_ENV', 'production');
    expect(setCookie(await POST(post({ ocultos: true })))).toMatch(/Secure/i);
  });

  it('desliga: Max-Age=0', async () => {
    const res = await POST(post({ ocultos: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ocultos: false });
    expect(setCookie(res)).toMatch(/^mf_valores_ocultos=;/);
    expect(setCookie(res)).toMatch(/Max-Age=0/i);
  });

  it.each([[{}], [{ ocultos: 'sim' }], [{ ocultos: 1 }], [null], ['{não é json']])(
    '400 com body inválido (%j)',
    async (body) => {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(setCookie(res)).toBe('');
    },
  );

  it('401 sem sessão', async () => {
    mockRequireSession.mockRejectedValueOnce(new Error('Não autorizado'));
    const res = await POST(post({ ocultos: true }));
    expect(res.status).toBe(401);
    expect(setCookie(res)).toBe('');
  });

  it('404 com a flag desligada', async () => {
    vi.stubEnv('VALORES_OCULTOS_HABILITADO', 'false');
    const res = await POST(post({ ocultos: true }));
    expect(res.status).toBe(404);
    expect(setCookie(res)).toBe('');
    expect(mockRequireSession).not.toHaveBeenCalled();
  });
});
