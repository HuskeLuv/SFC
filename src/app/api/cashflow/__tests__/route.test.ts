import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/cashflow');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/cashflow', () => {
  const mockTemplateGroup = {
    id: 'tpl-group-1',
    name: 'Receitas',
    type: 'entrada',
    userId: null,
    parentId: null,
    orderIndex: 0,
    items: [
      {
        id: 'tpl-item-1',
        name: 'Salario',
        groupId: 'tpl-group-1',
        userId: null,
        rank: 'a',
        significado: null,
        values: [],
      },
    ],
    children: [],
  };

  const mockCustomGroup = {
    id: 'custom-group-1',
    name: 'Receitas',
    type: 'entrada',
    userId: 'user-123',
    parentId: null,
    orderIndex: 0,
    items: [
      {
        id: 'custom-item-1',
        name: 'Salario',
        groupId: 'custom-group-1',
        userId: 'user-123',
        rank: 'a',
        significado: 'meu salario',
        values: [{ id: 'v1', month: 0, year: 2026, value: 5000 }],
      },
    ],
    children: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
  });

  it('retorna hierarquia de cashflow para usuario autenticado', async () => {
    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([mockTemplateGroup]) // templates
      .mockResolvedValueOnce([mockCustomGroup]); // customizations

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toBeDefined();
    expect(data.year).toBe(new Date().getFullYear());
    // customization should override template
    expect(data.groups[0].items[0].significado).toBe('meu salario');
  });

  it('filtra por ano quando parametro year fornecido', async () => {
    mockPrisma.cashflowGroup.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await GET(createRequest({ year: '2024' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.year).toBe(2024);
    // templates query
    expect(mockPrisma.cashflowGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: null, parentId: null },
      }),
    );
  });

  it('usa ano atual como padrao quando year nao fornecido', async () => {
    mockPrisma.cashflowGroup.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.year).toBe(new Date().getFullYear());
  });

  it('retorna 400 quando year eh invalido', async () => {
    const response = await GET(createRequest({ year: 'abc' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('inválido');
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('mescla templates com personalizacoes corretamente', async () => {
    const template = {
      ...mockTemplateGroup,
      items: [
        {
          id: 'tpl-item-1',
          name: 'Salario',
          groupId: 'tpl-group-1',
          userId: null,
          rank: 'a',
          significado: null,
          values: [],
        },
        {
          id: 'tpl-item-2',
          name: 'Freelance',
          groupId: 'tpl-group-1',
          userId: null,
          rank: 'b',
          significado: null,
          values: [],
        },
      ],
    };
    const custom = {
      ...mockCustomGroup,
      items: [
        {
          id: 'custom-item-1',
          name: 'Salario',
          groupId: 'custom-group-1',
          userId: 'user-123',
          rank: 'a',
          significado: 'customizado',
          values: [],
        },
      ],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([template])
      .mockResolvedValueOnce([custom]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should have both items: custom Salario + template Freelance
    const items = data.groups[0].items;
    expect(items.length).toBe(2);
    const salario = items.find((i: { name: string }) => i.name === 'Salario');
    expect(salario.significado).toBe('customizado');
  });
});
