import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

import { GET } from '../../auth/me/route';

const createRequest = () => new NextRequest('http://localhost/api/auth/me', { method: 'GET' });

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

  it('retorna 404 quando usuario nao existe no banco', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });
});
