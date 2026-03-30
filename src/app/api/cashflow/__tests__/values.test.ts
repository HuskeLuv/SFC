import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from '../values/route';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
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
  const req = new NextRequest('http://localhost/api/cashflow/values', {
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

const createRequestNoToken = (body: object) =>
  new NextRequest('http://localhost/api/cashflow/values', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('PATCH /api/cashflow/values', () => {
  const mockItem = {
    id: 'item-1',
    name: 'Salario',
    userId: 'user-123',
    groupId: 'group-1',
    rank: 'a',
    significado: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItemForUser.mockResolvedValue(mockItem);
  });

  it('atualiza valor mensal com sucesso (upsert - create)', async () => {
    mockPrisma.cashflowValue.findFirst.mockResolvedValue(null);
    mockPrisma.cashflowValue.create.mockResolvedValue({
      id: 'val-1',
      itemId: 'item-1',
      month: 3,
      year: new Date().getFullYear(),
      value: 5000,
    });
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({
      ...mockItem,
      values: [{ id: 'val-1', month: 3, value: 5000 }],
    });

    const response = await PATCH(
      createRequest({
        itemId: 'item-1',
        field: 'monthlyValue',
        value: 5000,
        monthIndex: 3,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('item-1');
  });

  it('atualiza valor mensal com sucesso (upsert - update)', async () => {
    mockPrisma.cashflowValue.findFirst.mockResolvedValue({
      id: 'existing-val-1',
      itemId: 'item-1',
      month: 3,
      value: 3000,
    });
    mockPrisma.cashflowValue.update.mockResolvedValue({
      id: 'existing-val-1',
      value: 5000,
    });
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({
      ...mockItem,
      values: [{ id: 'existing-val-1', month: 3, value: 5000 }],
    });

    const response = await PATCH(
      createRequest({
        itemId: 'item-1',
        field: 'monthlyValue',
        value: 5000,
        monthIndex: 3,
      }),
    );
    await response.json();

    expect(response.status).toBe(200);
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledWith({
      where: { id: 'existing-val-1' },
      data: { value: 5000 },
    });
  });

  it('retorna 400 quando monthIndex invalido (> 11)', async () => {
    const response = await PATCH(
      createRequest({
        itemId: 'item-1',
        field: 'monthlyValue',
        value: 5000,
        monthIndex: 12,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('retorna 400 quando monthIndex invalido (< 0)', async () => {
    const response = await PATCH(
      createRequest({
        itemId: 'item-1',
        field: 'monthlyValue',
        value: 5000,
        monthIndex: -1,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('retorna 400 quando campos obrigatorios ausentes (itemId)', async () => {
    const response = await PATCH(
      createRequest({
        field: 'monthlyValue',
        value: 5000,
        monthIndex: 3,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('itemId');
  });

  it('retorna 400 quando campo field ausente', async () => {
    const response = await PATCH(
      createRequest({
        itemId: 'item-1',
        value: 5000,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('field');
  });

  it('retorna 401 quando token nao fornecido', async () => {
    const response = await PATCH(
      createRequestNoToken({
        itemId: 'item-1',
        field: 'monthlyValue',
        value: 5000,
        monthIndex: 3,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Token');
  });

  it('atualiza campo name do item', async () => {
    const updatedItem = {
      ...mockItem,
      name: 'Novo Nome',
      values: [],
    };
    mockPrisma.cashflowItem.update.mockResolvedValue(updatedItem);

    const response = await PATCH(
      createRequest({
        itemId: 'item-1',
        field: 'name',
        value: 'Novo Nome',
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('Novo Nome');
  });

  it('distribui annualTotal igualmente entre os 12 meses', async () => {
    mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.cashflowValue.create.mockResolvedValue({});
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({
      ...mockItem,
      values: [],
    });

    const response = await PATCH(
      createRequest({
        itemId: 'item-1',
        field: 'annualTotal',
        value: 12000,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.create).toHaveBeenCalledTimes(12);
  });
});
