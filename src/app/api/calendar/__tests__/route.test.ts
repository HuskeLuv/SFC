import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  event: { findMany: vi.fn() },
}));

const mockJwtVerify = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('jsonwebtoken', () => ({ default: { verify: mockJwtVerify } }));

import { GET } from '../route';

const createRequest = (token?: string) => {
  const req = new NextRequest('http://localhost/api/calendar', { method: 'GET' });
  if (token) {
    req.cookies.set('token', token);
  }
  return req;
};

describe('GET /api/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockReturnValue({ id: 'user-1', email: 'test@test.com', role: 'user' });
  });

  it('retorna eventos do usuário', async () => {
    const mockEvents = [
      { id: 'evt-1', userId: 'user-1', title: 'Meeting', date: new Date().toISOString() },
      { id: 'evt-2', userId: 'user-1', title: 'Review', date: new Date().toISOString() },
    ];
    mockPrisma.event.findMany.mockResolvedValue(mockEvents);

    const response = await GET(createRequest('valid-token'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('evt-1');
  });

  it('retorna 401 sem token', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Não autorizado');
  });

  it('retorna lista vazia quando não há eventos', async () => {
    mockPrisma.event.findMany.mockResolvedValue([]);

    const response = await GET(createRequest('valid-token'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });
});
