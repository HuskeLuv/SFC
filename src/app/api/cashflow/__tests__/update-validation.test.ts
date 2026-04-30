import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  cashflowItem: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  cashflowValue: { deleteMany: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@prisma/client', () => ({ Prisma: {} }));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));
const mockHideTemplateGroup = vi.hoisted(() => vi.fn());
const mockHideTemplateItem = vi.hoisted(() => vi.fn());

vi.mock('@/utils/cashflowPersonalization', () => ({
  personalizeGroup: vi.fn(),
  personalizeItem: vi.fn(),
  getItemForUser: vi.fn(),
  getGroupForUser: vi.fn(),
  hideTemplateGroup: mockHideTemplateGroup,
  hideTemplateItem: mockHideTemplateItem,
}));
vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
}));
vi.mock('jsonwebtoken', () => ({
  default: { verify: () => ({ id: 'user-123', email: 'test@test.com', role: 'user' }) },
}));

import { PATCH } from '../update/route';
import { requireAuthWithActing } from '@/utils/auth';

const createRequest = (body: object) => {
  const req = new NextRequest('http://localhost/api/cashflow/update', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  Object.defineProperty(req, 'cookies', {
    get: () => ({
      get: (name: string) => (name === 'token' ? { value: 'valid-token' } : undefined),
    }),
  });
  return req;
};

describe('PATCH /api/cashflow/update — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 400 quando operation ausente', async () => {
    const response = await PATCH(createRequest({ type: 'group' }));
    expect(response.status).toBe(400);
  });

  it('retorna 400 quando type ausente', async () => {
    const response = await PATCH(createRequest({ operation: 'create' }));
    expect(response.status).toBe(400);
  });

  it('retorna 400 quando operation eh enum invalido', async () => {
    const response = await PATCH(createRequest({ operation: 'invalid', type: 'group' }));
    expect(response.status).toBe(400);
  });

  it('retorna erro ao deletar grupo com filhos', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({
      id: 'g1',
      userId: 'user-123',
      templateId: null,
    });
    // First call returns children, subsequent calls for those children return empty
    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([{ id: 'child-1' }]) // children of g1
      .mockResolvedValueOnce([]); // children of child-1 (none)

    const response = await PATCH(createRequest({ operation: 'delete', type: 'group', id: 'g1' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('subgrupos');
  });

  it('delete em template → cria tombstone (override layer)', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({
      id: 'tpl-1',
      userId: null,
      name: 'Receitas',
      type: 'entrada',
    });
    mockHideTemplateGroup.mockResolvedValue('tombstone-1');

    const response = await PATCH(
      createRequest({ operation: 'delete', type: 'group', id: 'tpl-1' }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hidden).toBe(true);
    expect(mockHideTemplateGroup).toHaveBeenCalledWith('tpl-1', 'user-123');
  });

  it('retorna 404 quando id de grupo nao existe', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue(null);

    const response = await PATCH(
      createRequest({ operation: 'delete', type: 'group', id: 'inexistente' }),
    );
    expect(response.status).toBe(404);
  });

  it('retorna 401 quando token nao fornecido', async () => {
    vi.mocked(requireAuthWithActing).mockRejectedValueOnce(new Error('Não autorizado'));
    const req = new NextRequest('http://localhost/api/cashflow/update', {
      method: 'PATCH',
      body: JSON.stringify({
        operation: 'create',
        type: 'group',
        data: { name: 'Test', type: 'entrada' },
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });
});
