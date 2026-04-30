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

const buildTemplateGroup = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'tpl-group-1',
  name: 'Receitas',
  type: 'entrada',
  userId: null,
  parentId: null,
  orderIndex: 0,
  templateId: null,
  hidden: false,
  items: [
    {
      id: 'tpl-item-1',
      name: 'Salario',
      groupId: 'tpl-group-1',
      userId: null,
      rank: 'a',
      significado: null,
      templateId: null,
      hidden: false,
      values: [],
    },
  ],
  children: [],
  ...overrides,
});

describe('GET /api/cashflow', () => {
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
      .mockResolvedValueOnce([buildTemplateGroup()])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toBeDefined();
    expect(data.year).toBe(new Date().getFullYear());
  });

  it('filtra por ano quando parametro year fornecido', async () => {
    mockPrisma.cashflowGroup.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await GET(createRequest({ year: '2024' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.year).toBe(2024);
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

  // ===== Override Layer scenarios =====

  it('Caso A: usuario sem customizacoes retorna templates intactos com isTemplate=true', async () => {
    const tpl = buildTemplateGroup();
    mockPrisma.cashflowGroup.findMany.mockResolvedValueOnce([tpl]).mockResolvedValueOnce([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].id).toBe('tpl-group-1');
    expect(data.groups[0].isTemplate).toBe(true);
    expect(data.groups[0].items[0].name).toBe('Salario');
    expect(data.groups[0].items[0].isTemplate).toBe(true);
  });

  it('Caso B: override de item por templateId aplica nome custom mantendo posicao do template', async () => {
    const tpl = buildTemplateGroup();
    const userOverrideGroup = {
      id: 'user-group-1',
      name: 'Receitas',
      type: 'entrada',
      userId: 'user-123',
      parentId: null,
      orderIndex: 0,
      templateId: 'tpl-group-1',
      hidden: false,
      items: [
        {
          id: 'user-item-1',
          name: 'Meu Salario',
          groupId: 'user-group-1',
          userId: 'user-123',
          rank: 'a',
          significado: 'minha personalizacao',
          templateId: 'tpl-item-1',
          hidden: false,
          values: [],
        },
      ],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce([userOverrideGroup]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(1);
    const items = data.groups[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('user-item-1');
    expect(items[0].name).toBe('Meu Salario');
    expect(items[0].significado).toBe('minha personalizacao');
    expect(items[0].isTemplate).toBe(false);
  });

  it('Caso C: tombstone (hidden=true) omite item-template do resultado', async () => {
    const tpl = buildTemplateGroup({
      items: [
        {
          id: 'tpl-item-1',
          name: 'Salario',
          groupId: 'tpl-group-1',
          userId: null,
          rank: 'a',
          significado: null,
          templateId: null,
          hidden: false,
          values: [],
        },
        {
          id: 'tpl-item-2',
          name: 'Freelance',
          groupId: 'tpl-group-1',
          userId: null,
          rank: 'b',
          significado: null,
          templateId: null,
          hidden: false,
          values: [],
        },
      ],
    });

    const userTombstoneGroup = {
      id: 'user-group-1',
      name: 'Receitas',
      type: 'entrada',
      userId: 'user-123',
      parentId: null,
      orderIndex: 0,
      templateId: 'tpl-group-1',
      hidden: false,
      items: [
        {
          id: 'user-item-tomb',
          name: 'Salario',
          groupId: 'user-group-1',
          userId: 'user-123',
          rank: 'a',
          significado: null,
          templateId: 'tpl-item-1',
          hidden: true,
          values: [],
        },
      ],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce([userTombstoneGroup]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    const items = data.groups[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Freelance');
  });

  it('Caso D: custom puro (templateId=null) anexa ao lado dos templates', async () => {
    const tpl = buildTemplateGroup();
    const userCustomGroup = {
      id: 'user-group-1',
      name: 'Receitas',
      type: 'entrada',
      userId: 'user-123',
      parentId: null,
      orderIndex: 0,
      templateId: 'tpl-group-1',
      hidden: false,
      items: [
        {
          id: 'user-item-custom',
          name: 'Bonus',
          groupId: 'user-group-1',
          userId: 'user-123',
          rank: 'c',
          significado: null,
          templateId: null,
          hidden: false,
          values: [],
        },
      ],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce([userCustomGroup]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    const items = data.groups[0].items;
    expect(items).toHaveLength(2);
    const names = items.map((i: { name: string }) => i.name).sort();
    expect(names).toEqual(['Bonus', 'Salario']);
  });

  it('Caso D2: grupo custom puro no nivel raiz aparece junto com templates', async () => {
    const tpl = buildTemplateGroup();
    const rootCustom = {
      id: 'root-custom',
      name: 'Cripto',
      type: 'investimento',
      userId: 'user-123',
      parentId: null,
      orderIndex: 5,
      templateId: null,
      hidden: false,
      items: [],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce([rootCustom]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(2);
    const names = data.groups.map((g: { name: string }) => g.name).sort();
    expect(names).toEqual(['Cripto', 'Receitas']);
  });

  it('Caso E: back-compat — clone fisico antigo (templateId=null) bate por nome+path', async () => {
    const tpl = buildTemplateGroup();
    const legacyClone = {
      id: 'legacy-clone',
      name: 'Receitas', // mesmo nome do template
      type: 'entrada',
      userId: 'user-123',
      parentId: null,
      orderIndex: 0,
      templateId: null, // clone fisico antigo, sem templateId
      hidden: false,
      items: [
        {
          id: 'legacy-item',
          name: 'Salario', // mesmo nome do item-template
          groupId: 'legacy-clone',
          userId: 'user-123',
          rank: 'a',
          significado: 'legado',
          templateId: null,
          hidden: false,
          values: [{ id: 'v1', month: 0, year: 2026, value: 5000 }],
        },
      ],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce([legacyClone]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].id).toBe('legacy-clone');
    const items = data.groups[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Salario');
    expect(items[0].significado).toBe('legado');
  });
});
