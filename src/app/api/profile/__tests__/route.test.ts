import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

const mockJwtVerify = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('jsonwebtoken', () => ({ default: { verify: mockJwtVerify } }));

import { GET } from '../route';

const createRequest = (token?: string) => {
  const req = new NextRequest('http://localhost/api/profile', { method: 'GET' });
  if (token) {
    req.cookies.set('token', token);
  }
  return req;
};

describe('GET /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockReturnValue({ id: 'user-1', email: 'test@test.com', role: 'user' });
  });

  it('retorna perfil do usuário autenticado', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
      role: 'user',
    };
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);

    const response = await GET(createRequest('valid-token'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
      role: 'user',
    });
  });

  it('retorna 401 sem token', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Não autorizado');
  });

  it('retorna 401 com token inválido', async () => {
    mockJwtVerify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const response = await GET(createRequest('bad-token'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Token inválido');
  });

  it('retorna 404 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await GET(createRequest('valid-token'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Usuário não encontrado');
  });
});
