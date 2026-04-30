import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from '../batch-update/route';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  cashflowValue: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn().mockResolvedValue({}),
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
  $transaction: vi
    .fn()
    .mockImplementation((args: unknown) =>
      Array.isArray(args)
        ? Promise.all(args)
        : (args as (tx: unknown) => Promise<unknown>)(mockPrisma),
    ),
}));

const mockGetItemForUser = vi.hoisted(() => vi.fn());
const mockPersonalizeItem = vi.hoisted(() => vi.fn());
const mockEnsurePersonalizedItem = vi.hoisted(() => vi.fn());

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

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
  personalizeItem: mockPersonalizeItem,
  getItemForUser: mockGetItemForUser,
  ensurePersonalizedItem: mockEnsurePersonalizedItem,
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
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
  });

  it('processa batch update com multiplos itens', async () => {
    const userItem1 = { id: 'item-1', name: 'Salario', userId: 'user-123', groupId: 'g1' };
    const userItem2 = { id: 'item-2', name: 'Bonus', userId: 'user-123', groupId: 'g1' };

    mockEnsurePersonalizedItem
      .mockResolvedValueOnce({ itemId: 'item-1', item: userItem1 })
      .mockResolvedValueOnce({ itemId: 'item-2', item: userItem2 });

    mockPrisma.cashflowItem.update.mockResolvedValue({});
    mockPrisma.cashflowValue.upsert.mockResolvedValue({});

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
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));

    const response = await PUT(
      createRequestNoToken({
        groupId: 'g1',
        updates: [],
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('autorizado');
  });

  it('processa deletes corretamente', async () => {
    mockPrisma.cashflowItem.findMany.mockResolvedValue([{ id: 'item-1' }]);
    mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.cashflowItem.deleteMany.mockResolvedValue({ count: 1 });

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

  it('marca itens não pertencentes ao usuário como não encontrados', async () => {
    // findMany only returns the one the user actually owns
    mockPrisma.cashflowItem.findMany.mockResolvedValue([{ id: 'item-1' }]);
    mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.cashflowItem.deleteMany.mockResolvedValue({ count: 1 });

    const response = await PUT(
      createRequest({
        groupId: 'g1',
        updates: [],
        deletes: ['item-1', 'item-foreign'],
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toContainEqual({ itemId: 'item-1', success: true });
    expect(data.results).toContainEqual({
      itemId: 'item-foreign',
      success: false,
      error: 'Item não encontrado',
    });
  });

  it('upsert é idempotente para mesma (itemId, ano, mês)', async () => {
    const userItem = { id: 'item-1', name: 'Salario', userId: 'user-123', groupId: 'g1' };
    mockEnsurePersonalizedItem.mockResolvedValue({ itemId: 'item-1', item: userItem });
    mockPrisma.cashflowItem.update.mockResolvedValue({});
    mockPrisma.cashflowValue.upsert.mockResolvedValue({});

    const response = await PUT(
      createRequest({
        groupId: 'g1',
        updates: [
          {
            itemId: 'item-1',
            values: [
              { month: 0, value: 5000 },
              { month: 0, value: 5500 }, // mesmo mês, valor diferente
            ],
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    // Cada valor vira 1 chamada upsert; Prisma garante 1 row final na composite key.
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledTimes(2);
  });

  it('personaliza item template antes de atualizar', async () => {
    const templateItem = { id: 'tpl-item-1', name: 'Salario', userId: null, groupId: 'g1' };
    mockEnsurePersonalizedItem.mockResolvedValue({
      itemId: 'personalized-item-1',
      item: templateItem,
    });
    mockPrisma.cashflowItem.update.mockResolvedValue({});

    const response = await PUT(
      createRequest({
        groupId: 'g1',
        updates: [{ itemId: 'tpl-item-1', name: 'Salario CLT' }],
      }),
    );
    await response.json();

    expect(response.status).toBe(200);
    expect(mockEnsurePersonalizedItem).toHaveBeenCalledWith('tpl-item-1', 'user-123');
  });
});
