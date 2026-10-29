import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  host: 'appmyfinance.com.br',
  token: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'host' ? estado.host : null) }),
  cookies: async () => ({
    get: (k: string) => (k === 'token' && estado.token ? { value: estado.token } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock('jose', () => ({ jwtVerify: async () => ({}) }));
vi.mock('@/components/landing/LandingPage', () => ({ default: () => null }));

import Home, { generateMetadata } from '../page';

beforeEach(() => {
  estado.host = 'appmyfinance.com.br';
  estado.token = undefined;
  process.env.JWT_SECRET = 'x';
});

describe('raiz do app', () => {
  it('domínio principal sem sessão: /signin (landing escondida)', async () => {
    await expect(Home()).rejects.toThrow('REDIRECT /signin');
  });

  it('domínio principal com sessão: /carteira', async () => {
    estado.token = 'jwt';
    await expect(Home()).rejects.toThrow('REDIRECT /carteira');
  });

  it('subdomínio da prévia: a landing, mesmo com sessão', async () => {
    estado.host = 'site.appmyfinance.com.br';
    estado.token = 'jwt';
    await expect(Home()).resolves.toBeTruthy();
  });

  it('prévia sem indexação; domínio principal sem robots', async () => {
    estado.host = 'site.appmyfinance.com.br:443';
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: false });
    estado.host = 'appmyfinance.com.br';
    expect((await generateMetadata()).robots).toBeUndefined();
  });
});
