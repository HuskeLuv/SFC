import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  cashflowGroup: { findMany: vi.fn() },
}));

const mockRequireAuth = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'user-123', email: 'test@test.com', role: 'user' }),
);

vi.mock('@/utils/auth', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

const createRequest = () => {
  const url = new URL('http://localhost/api/cashflow/structure');
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
    },
  ],
  children: [],
  ...overrides,
});

describe('GET /api/cashflow/structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockReturnValue({ id: 'user-123', email: 'test@test.com', role: 'user' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuth.mockImplementation(() => {
      throw new Error('Não autorizado');
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna 404 quando usuario nao existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    // Sem chamadas de findMany pois retorna 404 antes.

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('não encontrado');
  });

  it('Caso A: usuario sem customizacoes retorna templates (fast path)', async () => {
    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([buildTemplateGroup()]) // templates
      .mockResolvedValueOnce([]); // userRows

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('tpl-group-1');
    expect(data[0].isTemplate).toBe(true);
    expect(data[0].items[0].isTemplate).toBe(true);
  });

  it('Caso B: override de item por templateId aplica nome custom', async () => {
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
          significado: 'minha',
          templateId: 'tpl-item-1',
          hidden: false,
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
    expect(data[0].id).toBe('user-group-1');
    expect(data[0].items[0].id).toBe('user-item-1');
    expect(data[0].items[0].name).toBe('Meu Salario');
    expect(data[0].items[0].isTemplate).toBe(false);
  });

  it('Caso C: tombstone oculta item-template', async () => {
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
        },
      ],
    });
    const userOverride = {
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
          id: 'tomb',
          name: 'Salario',
          groupId: 'user-group-1',
          userId: 'user-123',
          rank: 'a',
          significado: null,
          templateId: 'tpl-item-1',
          hidden: true,
        },
      ],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce([userOverride]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    const itemNames = data[0].items.map((i: { name: string }) => i.name);
    expect(itemNames).toEqual(['Freelance']);
  });

  it('Caso D: custom puro adicionado ao lado do template', async () => {
    const tpl = buildTemplateGroup();
    const overrideGroup = {
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
          id: 'pure-custom',
          name: 'Bonus',
          groupId: 'user-group-1',
          userId: 'user-123',
          rank: 'c',
          significado: null,
          templateId: null,
          hidden: false,
        },
      ],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([tpl])
      .mockResolvedValueOnce([overrideGroup]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].items).toHaveLength(2);
    const names = data[0].items.map((i: { name: string }) => i.name).sort();
    expect(names).toEqual(['Bonus', 'Salario']);
  });

  it('Caso E: back-compat — clone fisico antigo bate por nome', async () => {
    const tpl = buildTemplateGroup();
    const legacy = {
      id: 'legacy',
      name: 'Receitas',
      type: 'entrada',
      userId: 'user-123',
      parentId: null,
      orderIndex: 0,
      templateId: null,
      hidden: false,
      items: [
        {
          id: 'legacy-item',
          name: 'Salario',
          groupId: 'legacy',
          userId: 'user-123',
          rank: 'a',
          significado: 'legado',
          templateId: null,
          hidden: false,
        },
      ],
      children: [],
    };

    mockPrisma.cashflowGroup.findMany.mockResolvedValueOnce([tpl]).mockResolvedValueOnce([legacy]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].id).toBe('legacy');
    expect(data[0].items).toHaveLength(1);
    expect(data[0].items[0].id).toBe('legacy-item');
    expect(data[0].items[0].significado).toBe('legado');
  });
});
