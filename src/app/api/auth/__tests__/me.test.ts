import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

const mockJwt = vi.hoisted(() => ({
  verify: vi.fn(),
}));

const mockResolveActingContext = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ targetUserId: 'user-1', actingClient: null }),
);

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('jsonwebtoken', () => ({ default: mockJwt }));
vi.mock('@/utils/consultantActing', () => ({
  resolveActingContext: mockResolveActingContext,
}));

import { GET } from '../../auth/me/route';

const createRequest = (cookies?: Record<string, string>) => {
  const req = new NextRequest('http://localhost/api/auth/me', { method: 'GET' });
  if (cookies) {
    Object.entries(cookies).forEach(([k, v]) => req.cookies.set(k, v));
  }
  return req;
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
    mockJwt.verify.mockReturnValue({ id: 'user-1', email: 'test@test.com', role: 'user' });
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockResolveActingContext.mockResolvedValue({ targetUserId: 'user-1', actingClient: null });
  });

  it('retorna dados do usuario autenticado', async () => {
    const response = await GET(createRequest({ token: 'valid-token' }));
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
    mockResolveActingContext.mockResolvedValue({
      targetUserId: 'client-1',
      actingClient,
    });

    const response = await GET(createRequest({ token: 'valid-token' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.actingClient).toEqual(actingClient);
  });

  it('retorna 401 quando nao ha token', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna 401 quando token e invalido', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const response = await GET(createRequest({ token: 'invalid-token' }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Token inválido');
  });

  it('retorna 404 quando usuario nao existe no banco', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await GET(createRequest({ token: 'valid-token' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });
});
