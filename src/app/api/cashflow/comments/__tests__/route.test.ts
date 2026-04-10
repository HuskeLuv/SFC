import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '../route';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: { findFirst: vi.fn(), findUnique: vi.fn() },
  cashflowValue: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

const mockGetItemForUser = vi.hoisted(() => vi.fn());
const mockPersonalizeItem = vi.hoisted(() => vi.fn());
const mockEnsurePersonalizedItem = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/utils/cashflowPersonalization', () => ({
  getItemForUser: mockGetItemForUser,
  personalizeItem: mockPersonalizeItem,
  ensurePersonalizedItem: mockEnsurePersonalizedItem,
}));

const createGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/cashflow/comments');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const req = new NextRequest(url, { method: 'GET' });
  req.cookies.set('token', 'valid-token');
  return req;
};

const createPatchRequest = (body: Record<string, unknown>) => {
  const url = new URL('http://localhost/api/cashflow/comments');
  const req = new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  req.cookies.set('token', 'valid-token');
  return req;
};

describe('GET /api/cashflow/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
  });

  it('retorna comentario para item valido', async () => {
    mockGetItemForUser.mockResolvedValue({
      id: 'item-1',
      name: 'Salario',
      groupId: 'g1',
      userId: 'user-123',
    });
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({
      id: 'v1',
      comment: 'Nota sobre salario',
      updatedAt: '2026-03-01',
    });

    const response = await GET(createGetRequest({ itemId: 'item-1', month: '2', year: '2026' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.comment).toBe('Nota sobre salario');
  });

  it('retorna 401 quando token nao fornecido', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));

    const url = new URL('http://localhost/api/cashflow/comments');
    const req = new NextRequest(url, { method: 'GET' });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('autorizado');
  });

  it('retorna 400 quando parametros obrigatorios ausentes', async () => {
    const response = await GET(createGetRequest({ itemId: 'item-1' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('obrigatórios');
  });

  it('retorna null quando nao ha comentario', async () => {
    mockGetItemForUser.mockResolvedValue({
      id: 'item-1',
      name: 'Salario',
      groupId: 'g1',
      userId: 'user-123',
    });
    mockPrisma.cashflowValue.findFirst.mockResolvedValue(null);

    const response = await GET(createGetRequest({ itemId: 'item-1', month: '0', year: '2026' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.comment).toBeNull();
  });
});

describe('PATCH /api/cashflow/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
  });

  it('atualiza comentario existente', async () => {
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'item-1',
      item: { id: 'item-1', name: 'Salario', groupId: 'g1', userId: 'user-123' },
    });
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({
      id: 'v1',
      comment: 'old',
      updatedAt: '2026-03-01',
    });
    mockPrisma.cashflowValue.update.mockResolvedValue({
      id: 'v1',
      comment: 'Novo comentario',
      updatedAt: '2026-03-15',
    });

    const response = await PATCH(
      createPatchRequest({ itemId: 'item-1', month: 2, year: 2026, comment: 'Novo comentario' }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.comment).toBe('Novo comentario');
  });
});
