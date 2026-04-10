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

const mockPersonalizeGroup = vi.hoisted(() => vi.fn());
const mockPersonalizeItem = vi.hoisted(() => vi.fn());
const mockGetItemForUser = vi.hoisted(() => vi.fn());
const mockGetGroupForUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@prisma/client', () => ({ Prisma: {} }));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));
vi.mock('@/utils/cashflowPersonalization', () => ({
  personalizeGroup: mockPersonalizeGroup,
  personalizeItem: mockPersonalizeItem,
  getItemForUser: mockGetItemForUser,
  getGroupForUser: mockGetGroupForUser,
}));
vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
}));
vi.mock('jsonwebtoken', () => ({
  default: { verify: () => ({ id: 'user-123', email: 'test@test.com', role: 'user' }) },
}));

import { PATCH } from '../update/route';

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

describe('PATCH /api/cashflow/update — CRUD operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria grupo com sucesso', async () => {
    mockPrisma.cashflowGroup.create.mockResolvedValue({
      id: 'new-group-1',
      name: 'Novo Grupo',
      type: 'entrada',
      userId: 'user-123',
      items: [],
      children: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'create',
        type: 'group',
        data: { name: 'Novo Grupo', type: 'entrada' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.group.name).toBe('Novo Grupo');
  });

  it('cria item com sucesso', async () => {
    mockGetGroupForUser.mockResolvedValue({ id: 'group-1', userId: 'user-123' });
    mockPrisma.cashflowItem.create.mockResolvedValue({
      id: 'new-item-1',
      name: 'Novo Item',
      groupId: 'group-1',
      values: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'create',
        type: 'item',
        data: { groupId: 'group-1', name: 'Novo Item' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.item.name).toBe('Novo Item');
  });

  it('personaliza grupo template ao atualizar', async () => {
    mockGetGroupForUser.mockResolvedValue({ id: 'tpl-1', userId: null, orderIndex: 0 });
    mockPersonalizeGroup.mockResolvedValue('pers-1');
    mockPrisma.cashflowGroup.update.mockResolvedValue({
      id: 'pers-1',
      name: 'Editado',
      items: [],
      children: [],
    });

    const response = await PATCH(
      createRequest({ operation: 'update', type: 'group', id: 'tpl-1', data: { name: 'Editado' } }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeGroup).toHaveBeenCalledWith('tpl-1', 'user-123');
    expect(data.success).toBe(true);
  });

  it('atualiza item do usuario sem personalizar', async () => {
    mockGetItemForUser.mockResolvedValue({ id: 'item-1', userId: 'user-123' });
    mockPrisma.cashflowItem.update.mockResolvedValue({
      id: 'item-1',
      name: 'Salario CLT',
      values: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'update',
        type: 'item',
        id: 'item-1',
        data: { name: 'Salario CLT' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeItem).not.toHaveBeenCalled();
    expect(data.item.name).toBe('Salario CLT');
  });

  it('deleta grupo vazio com sucesso', async () => {
    mockPrisma.cashflowGroup.findFirst.mockResolvedValue({
      id: 'g1',
      userId: 'user-123',
      items: [],
      children: [],
    });
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.cashflowItem.count.mockResolvedValue(0);
    mockPrisma.cashflowGroup.delete.mockResolvedValue({});

    const response = await PATCH(createRequest({ operation: 'delete', type: 'group', id: 'g1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('deleta item com sucesso', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'i1',
      userId: 'user-123',
      values: [],
    });
    mockPrisma.cashflowItem.delete.mockResolvedValue({});

    const response = await PATCH(createRequest({ operation: 'delete', type: 'item', id: 'i1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
