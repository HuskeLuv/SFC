import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mockPrisma = vi.hoisted(() => ({
  notification: { findMany: vi.fn(), updateMany: vi.fn() },
}));

const mockRequireSession = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@test.com', role: 'user' }),
);

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('@/utils/auth', () => ({
  requireSession: mockRequireSession,
}));

import { GET, PATCH } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/notifications', { method: 'GET' });

const createPatchRequest = (body: object) =>
  new NextRequest('http://localhost/api/notifications', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('GET /api/notifications', () => {
  const now = new Date();
  const mockNotifications = [
    {
      id: 'notif-1',
      title: 'Test Notification',
      message: 'Hello world',
      type: 'info',
      metadata: null,
      readAt: null,
      createdAt: now,
      invite: null,
    },
    {
      id: 'notif-2',
      title: 'Read Notification',
      message: 'Already read',
      type: 'info',
      metadata: null,
      readAt: now,
      createdAt: now,
      invite: {
        id: 'invite-1',
        status: 'pending',
        consultant: {
          id: 'consultant-1',
          userId: 'user-consultant',
          user: { id: 'user-consultant', name: 'Consultant', email: 'consultant@test.com' },
        },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({ id: 'user-1', email: 'test@test.com', role: 'user' });
    mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
  });

  it('retorna notificacoes do usuario', async () => {
    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notifications).toHaveLength(2);
    expect(data.notifications[0].id).toBe('notif-1');
    expect(data.notifications[0].readAt).toBeNull();
    expect(data.notifications[1].readAt).toBe(now.toISOString());
    expect(data.notifications[1].invite).toEqual({
      id: 'invite-1',
      status: 'pending',
      consultant: {
        id: 'consultant-1',
        userId: 'user-consultant',
        name: 'Consultant',
        email: 'consultant@test.com',
      },
    });
  });

  it('retorna 401 com sessão revogada (sessionVersion divergente)', async () => {
    mockRequireSession.mockRejectedValueOnce(new ApiError(401, 'Sessão expirada'));

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
    expect(mockPrisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireSession.mockImplementation(() => {
      throw new Error('Não autorizado');
    });

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autenticado');
  });
});

describe('PATCH /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({ id: 'user-1', email: 'test@test.com', role: 'user' });
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });
  });

  it('marca notificacoes como lidas', async () => {
    const response = await PATCH(createPatchRequest({ ids: ['notif-1', 'notif-2'] }));

    expect(response.status).toBe(204);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        id: { in: ['notif-1', 'notif-2'] },
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it('retorna 400 quando ids nao informados', async () => {
    const response = await PATCH(createPatchRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Nenhum identificador informado');
  });

  it('retorna 400 com array vazio de ids', async () => {
    const response = await PATCH(createPatchRequest({ ids: [] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Nenhum identificador informado');
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireSession.mockImplementation(() => {
      throw new Error('Não autorizado');
    });

    const response = await PATCH(createPatchRequest({ ids: ['notif-1'] }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autenticado');
  });
});
