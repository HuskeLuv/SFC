import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  consultantInvite: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  consultant: { findUnique: vi.fn() },
  clientConsultant: { findFirst: vi.fn() },
  notification: { create: vi.fn() },
}));

const mockAuthenticateConsultant = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('@/utils/consultantAuth', () => ({
  authenticateConsultant: mockAuthenticateConsultant,
}));

import { GET } from '../../consultant/invitations/route';

const createGetRequest = (params?: Record<string, string>) => {
  const url = new URL('http://localhost/api/consultant/invitations');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
};

const makeInvite = (id: string, email: string) => ({
  id,
  email,
  status: 'pending',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  respondedAt: null,
  invitedUser: { id: `user-${id}`, name: `User ${id}`, email },
});

describe('GET /api/consultant/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateConsultant.mockResolvedValue({
      consultantId: 'consultant-1',
      userId: 'user-1',
    });
  });

  it('retorna convites sem paginação (formato original)', async () => {
    const invites = [makeInvite('inv-1', 'a@test.com'), makeInvite('inv-2', 'b@test.com')];
    mockPrisma.consultantInvite.findMany.mockResolvedValue(invites);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invitations).toHaveLength(2);
    expect(data.invitations[0].id).toBe('inv-1');
    expect(data.pagination).toBeUndefined();
    expect(mockPrisma.consultantInvite.count).not.toHaveBeenCalled();
  });

  it('retorna convites com paginação quando page e limit fornecidos', async () => {
    const invites = [makeInvite('inv-1', 'a@test.com'), makeInvite('inv-2', 'b@test.com')];
    mockPrisma.consultantInvite.findMany.mockResolvedValue(invites);
    mockPrisma.consultantInvite.count.mockResolvedValue(5);

    const response = await GET(createGetRequest({ page: '1', limit: '2' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(mockPrisma.consultantInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 2 }),
    );
    expect(mockPrisma.consultantInvite.count).toHaveBeenCalled();
  });

  it('retorna dados vazios quando página está além do intervalo', async () => {
    mockPrisma.consultantInvite.findMany.mockResolvedValue([]);
    mockPrisma.consultantInvite.count.mockResolvedValue(2);

    const response = await GET(createGetRequest({ page: '99', limit: '2' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(0);
    expect(data.pagination.page).toBe(99);
    expect(data.pagination.total).toBe(2);
    expect(data.pagination.hasNextPage).toBe(false);
    expect(data.pagination.hasPreviousPage).toBe(true);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockAuthenticateConsultant.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
