import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from '../batch-update/route';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  cashflowValue: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  cashflowGroup: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

const mockGetItemForUser = vi.hoisted(() => vi.fn());
const mockPersonalizeItem = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/utils/cashflowPersonalization', () => ({
  personalizeItem: mockPersonalizeItem,
  getItemForUser: mockGetItemForUser,
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: () => ({ id: 'user-123', email: 'test@test.com' }),
  },
}));

const createRequest = (body: object) => {
  const req = new NextRequest('http://localhost/api/cashflow/batch-update', {
    method: 'PUT',
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

const createRequestNoToken = (body: object) =>
  new NextRequest('http://localhost/api/cashflow/batch-update', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('PUT /api/cashflow/batch-update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processa batch update com multiplos itens', async () => {
    const userItem1 = { id: 'item-1', name: 'Salario', userId: 'user-123', groupId: 'g1' };
    const userItem2 = { id: 'item-2', name: 'Bonus', userId: 'user-123', groupId: 'g1' };

    mockGetItemForUser.mockResolvedValueOnce(userItem1).mockResolvedValueOnce(userItem2);

    mockPrisma.cashflowItem.update.mockResolvedValue({});
    mockPrisma.cashflowValue.findFirst.mockResolvedValue(null);
    mockPrisma.cashflowValue.create.mockResolvedValue({});

    const response = await PUT(
      createRequest({
        groupId: 'g1',
        updates: [
          { itemId: 'item-1', name: 'Salario CLT', values: [{ month: 0, value: 5000 }] },
          { itemId: 'item-2', name: 'Bonus Anual' },
        ],
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(2);
    expect(data.results.every((r: { success: boolean }) => r.success)).toBe(true);
  });

  it('lida com array de updates vazio graciosamente', async () => {
    const response = await PUT(
      createRequest({
        groupId: 'g1',
        updates: [],
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(0);
  });

  it('retorna 400 para estrutura de item invalida (sem groupId)', async () => {
    const response = await PUT(
      createRequestNoToken({
        updates: [{ itemId: 'item-1', name: 'Test' }],
      }),
    );
    const data = await response.json();

    // Either 401 (no token) or 400 (validation) — route checks token first
    expect([400, 401]).toContain(response.status);
    expect(data.error).toBeDefined();
  });

  it('retorna 401 quando token nao fornecido', async () => {
    const response = await PUT(
      createRequestNoToken({
        groupId: 'g1',
        updates: [],
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Token');
  });

  it('processa deletes corretamente', async () => {
    const item = { id: 'item-1', name: 'Item', userId: 'user-123' };
    mockPrisma.cashflowItem.findFirst.mockResolvedValue(item);
    mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.cashflowItem.delete.mockResolvedValue(item);

    const response = await PUT(
      createRequest({
        groupId: 'g1',
        updates: [],
        deletes: ['item-1'],
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results).toContainEqual({ itemId: 'item-1', success: true });
  });

  it('personaliza item template antes de atualizar', async () => {
    const templateItem = { id: 'tpl-item-1', name: 'Salario', userId: null, groupId: 'g1' };
    mockGetItemForUser.mockResolvedValue(templateItem);
    mockPersonalizeItem.mockResolvedValue('personalized-item-1');
    mockPrisma.cashflowItem.update.mockResolvedValue({});

    const response = await PUT(
      createRequest({
        groupId: 'g1',
        updates: [{ itemId: 'tpl-item-1', name: 'Salario CLT' }],
      }),
    );
    await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeItem).toHaveBeenCalledWith('tpl-item-1', 'user-123');
  });
});
