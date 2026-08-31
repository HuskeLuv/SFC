import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  cashflowGroup: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
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
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123', email: 'test@test.com' });
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));

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

  it('Caso F: nos na profundidade maxima do include (sem items/children) nao quebram o merge', async () => {
    // O include do Prisma só carrega 3 níveis de grupos: o neto chega SEM as
    // propriedades items/children. Regressão do 500 "groups is not iterable".
    const deepGrandchild = {
      id: 'user-neto',
      name: 'Neto',
      type: 'saida',
      userId: 'user-123',
      parentId: 'user-filho',
      orderIndex: 0,
      templateId: null,
      hidden: false,
      // sem items nem children, como o Prisma devolve na profundidade máxima
    };
    const userRoot = {
      id: 'user-raiz',
      name: 'Despesas Custom',
      type: 'saida',
      userId: 'user-123',
      parentId: null,
      orderIndex: 5,
      templateId: null,
      hidden: false,
      items: [],
      children: [
        {
          id: 'user-filho',
          name: 'Filho',
          type: 'saida',
          userId: 'user-123',
          parentId: 'user-raiz',
          orderIndex: 0,
          templateId: null,
          hidden: false,
          items: [],
          children: [deepGrandchild],
        },
      ],
    };

    mockPrisma.cashflowGroup.findMany
      .mockResolvedValueOnce([buildTemplateGroup()]) // templates
      // userRows traz TODOS os grupos do usuário (não só raízes): os nós
      // aninhados também aparecem como linhas próprias, cada um com o include.
      .mockResolvedValueOnce([userRoot, userRoot.children[0], deepGrandchild]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    const custom = data.find((g: { id: string }) => g.id === 'user-raiz');
    expect(custom).toBeDefined();
    expect(custom.children[0].id).toBe('user-filho');
    expect(custom.children[0].children[0].id).toBe('user-neto');
    // Saída normalizada: mesmo sem as propriedades no input, o tree devolve arrays.
    expect(custom.children[0].children[0].children).toEqual([]);
    expect(custom.children[0].children[0].items).toEqual([]);
  });
});
