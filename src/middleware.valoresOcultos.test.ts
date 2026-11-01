import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockJwtVerify = vi.hoisted(() => vi.fn());
vi.mock('jose', () => ({ jwtVerify: mockJwtVerify }));
vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');

import { middleware } from './middleware';

function pedido(
  url: string,
  { method = 'GET', accept = 'text/html', cookies = {} as Record<string, string> } = {},
) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { accept },
  });
  for (const [nome, valor] of Object.entries({ token: 'valid.jwt.token', ...cookies })) {
    req.cookies.set(nome, valor);
  }
  return req;
}

const cookieDoOlho = (res: Response) =>
  (res.headers.get('set-cookie') ?? '')
    .split(/,(?=\s*[\w-]+=)/)
    .find((c) => c.trim().startsWith('mf_valores_ocultos='));

describe('middleware — renovação do cookie do "esconder valores"', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: 'user-1' } });
    vi.stubEnv('VALORES_OCULTOS_HABILITADO', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');
  });

  it('navegação de página com o cookie ligado: regrava por 1 ano', async () => {
    const res = await middleware(pedido('/carteira', { cookies: { mf_valores_ocultos: '1' } }));
    const cookie = cookieDoOlho(res);
    expect(cookie).toMatch(/mf_valores_ocultos=1/);
    expect(cookie).toMatch(/Max-Age=31536000/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/HttpOnly/i);
  });

  it('sem o cookie, com o cookie desligado ou fora de navegação de página: não mexe', async () => {
    expect(cookieDoOlho(await middleware(pedido('/carteira')))).toBeUndefined();
    expect(
      cookieDoOlho(await middleware(pedido('/carteira', { cookies: { mf_valores_ocultos: '' } }))),
    ).toBeUndefined();
    expect(
      cookieDoOlho(
        await middleware(
          pedido('/api/auth/me', {
            accept: 'application/json',
            cookies: { mf_valores_ocultos: '1' },
          }),
        ),
      ),
    ).toBeUndefined();
    expect(
      cookieDoOlho(
        await middleware(
          pedido('/carteira', { accept: 'text/x-component', cookies: { mf_valores_ocultos: '1' } }),
        ),
      ),
    ).toBeUndefined();
  });

  it('flag desligada: não renova', async () => {
    vi.stubEnv('VALORES_OCULTOS_HABILITADO', 'false');
    const res = await middleware(pedido('/carteira', { cookies: { mf_valores_ocultos: '1' } }));
    expect(cookieDoOlho(res)).toBeUndefined();
  });
});
