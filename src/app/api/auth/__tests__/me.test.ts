import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { ApiError } from '@/utils/apiErrorHandler';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

import { GET } from '../../auth/me/route';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const createRequest = (token?: string) =>
  new NextRequest('http://localhost/api/auth/me', {
    method: 'GET',
    headers: token ? { cookie: `token=${token}` } : {},
  });

const DAY = 86400;
const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);

const authAs = (payload: Record<string, unknown>) =>
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user', ...payload },
    targetUserId: 'user-1',
    actingClient: null,
  });

const tokenClaims = (res: Response) => {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const value = /token=([^;]*)/.exec(setCookie)?.[1] ?? '';
  return {
    setCookie,
    claims: jwt.verify(value, process.env.JWT_SECRET!) as Record<string, number | string | boolean>,
  };
};

describe('GET /api/auth/me', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test User',
    avatarUrl: null,
    role: 'user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
  });

  it('retorna dados do usuario autenticado', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      avatarUrl: null,
      role: 'user',
      actingClient: null,
    });
  });

  it('retorna actingClient quando consultor esta atuando', async () => {
    const actingClient = { id: 'client-1', name: 'Cliente Test', email: 'client@test.com' };
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'consultant' },
      targetUserId: 'client-1',
      actingClient,
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.actingClient).toEqual(actingClient);
  });

  it('retorna 401 quando nao autenticado (sem token ou token invalido)', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('sessão revogada (sv divergente): 401 e cookie limpo', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new ApiError(401, 'Sessão expirada'));

    const response = await GET(createRequest('qualquer'));

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Sessão expirada');
    expect(response.headers.get('set-cookie')).toMatch(/token=;.*Max-Age=0/);
  });

  it('erro que não é de autenticação segue o tratamento padrão, sem limpar o cookie', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new ApiError(403, 'Acesso negado'));
    const response = await GET(createRequest('qualquer'));
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('retorna 404 quando usuario nao existe no banco', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });
});

describe('GET /api/auth/me — renovação deslizante', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
  });

  it('com "Manter conectado" e token com mais de 12h: reemite 30 dias preservando at e sv', async () => {
    const at = now() - 5 * DAY;
    authAs({ sv: 3, rm: true, at, iat: now() - 13 * HOUR, exp: now() + 29 * DAY });

    const response = await GET(createRequest());
    expect(response.status).toBe(200);
    const out = tokenClaims(response);
    expect(out).not.toBeNull();
    expect(out!.setCookie).toContain('Max-Age=2592000');
    expect(out!.claims).toMatchObject({ id: 'user-1', role: 'user', sv: 3, rm: true, at });
    expect(Number(out!.claims.exp) - Number(out!.claims.iat)).toBe(30 * DAY);
  });

  it('token com menos de 12h: não renova', async () => {
    authAs({ sv: 0, rm: true, at: now() - HOUR, iat: now() - HOUR, exp: now() + 29 * DAY });
    const response = await GET(createRequest());
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('sem "Manter conectado": nunca renova', async () => {
    authAs({ sv: 0, rm: false, at: now() - 11 * HOUR, iat: now() - 11 * HOUR, exp: now() + HOUR });
    expect((await GET(createRequest())).headers.get('set-cookie')).toBeNull();
  });

  it('perto do teto de 90 dias: renova só até o teto', async () => {
    const at = now() - 80 * DAY;
    authAs({ sv: 0, rm: true, at, iat: now() - 2 * DAY, exp: now() + 28 * DAY });
    const out = tokenClaims(await GET(createRequest()));
    expect(out).not.toBeNull();
    expect(Number(out!.claims.exp)).toBeLessThanOrEqual(at + 90 * DAY + 1);
    const maxAge = Number(/Max-Age=(\d+)/.exec(out!.setCookie)?.[1]);
    expect(maxAge).toBeLessThanOrEqual(10 * DAY + 1);
    expect(maxAge).toBeGreaterThan(9 * DAY);
  });

  it('depois do teto de 90 dias: não renova', async () => {
    authAs({ sv: 0, rm: true, at: now() - 91 * DAY, iat: now() - 2 * DAY, exp: now() + DAY });
    expect((await GET(createRequest())).headers.get('set-cookie')).toBeNull();
  });

  it.each(['admin', 'consultant'])('%s nunca renova', async (role) => {
    authAs({ role, sv: 0, rm: true, at: now() - 20 * HOUR, iat: now() - 20 * HOUR });
    expect((await GET(createRequest())).headers.get('set-cookie')).toBeNull();
  });

  it('token legado de 7 dias (sem sv/rm/at): renova no formato novo com at=iat', async () => {
    const iat = now() - DAY;
    authAs({ iat, exp: iat + 7 * DAY });
    const out = tokenClaims(await GET(createRequest()));
    expect(out).not.toBeNull();
    expect(out!.claims).toMatchObject({ id: 'user-1', sv: 0, rm: true, at: iat });
  });

  it('token legado de 1 dia: não renova (era sessão sem "Manter conectado")', async () => {
    const iat = now() - 13 * HOUR;
    authAs({ iat, exp: iat + DAY });
    expect((await GET(createRequest())).headers.get('set-cookie')).toBeNull();
  });
});
