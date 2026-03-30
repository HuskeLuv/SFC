import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  cashflowGroup: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  cashflowItem: { create: vi.fn(), findUnique: vi.fn() },
  cashflowValue: { create: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/cashflowPersonalization', () => ({
  personalizeGroup: vi.fn().mockResolvedValue('group-personalized'),
}));

import { GET, POST } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/investimento', {
    method: 'GET',
  });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/investimento', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('GET /api/carteira/investimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('retorna investimentos do usuário', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([
      {
        id: 'g-1',
        name: 'Investimentos',
        type: 'investimento',
        items: [
          { id: 'item-1', name: 'CDB', values: [{ value: 1000 }] },
          { id: 'item-2', name: 'Tesouro', values: [{ value: 2000 }] },
        ],
      },
    ]);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('retorna 404 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });
});

describe('POST /api/carteira/investimento', () => {
  const mockUser = { id: 'user-1', email: 'test@test.com' };
  const mockGroup = { id: 'group-1', name: 'Investimentos', type: 'investimento' };
  const mockItem = { id: 'item-1', name: 'CDB Banco X', groupId: 'group-1' };
  const mockItemComplete = {
    ...mockItem,
    values: [{ value: 500 }],
    group: mockGroup,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.cashflowGroup.findFirst.mockResolvedValue(mockGroup);
    mockPrisma.cashflowItem.create.mockResolvedValue(mockItem);
    mockPrisma.cashflowValue.create.mockResolvedValue({});
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(mockItemComplete);
  });

  it('cria investimento com sucesso', async () => {
    const response = await POST(
      createPostRequest({
        name: 'CDB Banco X',
        valor: 500,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data.id).toBe('item-1');
    expect(mockPrisma.cashflowItem.create).toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.create).toHaveBeenCalled();
  });

  it('retorna 400 quando valor está ausente', async () => {
    const response = await POST(
      createPostRequest({
        name: 'CDB',
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 400 quando valor é negativo', async () => {
    const response = await POST(
      createPostRequest({
        name: 'CDB',
        valor: -100,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 400 quando valor é zero', async () => {
    const response = await POST(
      createPostRequest({
        name: 'CDB',
        valor: 0,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 404 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const response = await POST(
      createPostRequest({
        name: 'CDB',
        valor: 500,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await POST(
      createPostRequest({
        name: 'CDB',
        valor: 500,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});
