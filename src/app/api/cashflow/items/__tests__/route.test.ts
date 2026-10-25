import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: { create: vi.fn() },
  userChangeLog: { create: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

const mockGetGroupForUser = vi.hoisted(() => vi.fn());
const mockPersonalizeGroup = vi.hoisted(() => vi.fn());
const mockEstadoV2 = vi.hoisted(() => vi.fn());
const mockGetMerged = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/utils/cashflowPersonalization', () => ({
  getGroupForUser: mockGetGroupForUser,
  personalizeGroup: mockPersonalizeGroup,
}));

vi.mock('@/services/cashflow/orcamentoV2/acesso', () => ({
  estadoAcessoOrcamentoV2: mockEstadoV2,
}));

vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMerged,
}));

const createPostRequest = (body: Record<string, unknown>) => {
  const url = new URL('http://localhost/api/cashflow/items');
  const req = new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  req.cookies.set('token', 'valid-token');
  return req;
};

describe('POST /api/cashflow/items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockEstadoV2.mockResolvedValue({ estado: 'desligada', ativado: false });
  });

  it('cria item com sucesso em grupo personalizado', async () => {
    mockGetGroupForUser.mockResolvedValue({
      id: 'group-1',
      name: 'Receitas',
      userId: 'user-123',
    });
    const newItem = {
      id: 'new-item-1',
      name: 'Freelance',
      userId: 'user-123',
      groupId: 'group-1',
      rank: null,
      significado: null,
      values: [],
    };
    mockPrisma.cashflowItem.create.mockResolvedValue(newItem);

    const response = await POST(createPostRequest({ groupId: 'group-1', name: 'Freelance' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('Freelance');
    expect(data.userId).toBe('user-123');
  });

  it('personaliza grupo template antes de criar item', async () => {
    mockGetGroupForUser.mockResolvedValue({
      id: 'tpl-group-1',
      name: 'Receitas',
      userId: null, // template
    });
    mockPersonalizeGroup.mockResolvedValue('personalized-group-1');
    mockPrisma.cashflowItem.create.mockResolvedValue({
      id: 'new-item-1',
      name: 'Bonus',
      userId: 'user-123',
      groupId: 'personalized-group-1',
      rank: null,
      significado: null,
      values: [],
    });

    const response = await POST(createPostRequest({ groupId: 'tpl-group-1', name: 'Bonus' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeGroup).toHaveBeenCalledWith('tpl-group-1', 'user-123');
    expect(data.groupId).toBe('personalized-group-1');
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));

    const response = await POST(createPostRequest({ groupId: 'g1', name: 'Test' }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna erro de validacao quando campos obrigatorios ausentes', async () => {
    const response = await POST(createPostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('inválidos');
  });

  describe('Orçamento v2 (usuário ativado)', () => {
    // Árvore mesclada sintética: Despesas > Despesas Fixas > Habitação (com Geral).
    const arvoreV2 = () => [
      {
        id: 'desp',
        name: 'Despesas',
        templateName: 'Despesas',
        type: 'despesa',
        userId: null,
        isTemplate: true,
        items: [],
        children: [
          {
            id: 'fixas',
            name: 'Despesas Fixas',
            templateName: 'Despesas Fixas',
            type: 'despesa',
            userId: null,
            isTemplate: true,
            items: [],
            children: [
              {
                id: 'hab',
                name: 'Habitação',
                templateName: 'Habitação',
                type: 'despesa',
                userId: 'user-123',
                templateId: 'tpl-hab',
                items: [
                  { id: 'a', name: 'Aluguel', orderIndex: 3, isGeral: false },
                  { id: 'g', name: 'Geral', orderIndex: 0, isGeral: true },
                ],
                children: [],
              },
            ],
          },
        ],
      },
    ];

    beforeEach(() => {
      mockEstadoV2.mockResolvedValue({ estado: 'liberada', ativado: true });
      mockGetMerged.mockResolvedValue(arvoreV2());
      mockGetGroupForUser.mockResolvedValue({ id: 'hab', name: 'Habitação', userId: 'user-123' });
      mockPrisma.cashflowItem.create.mockImplementation(async ({ data }) => ({
        id: 'new',
        ...data,
        values: [],
      }));
    });

    it('cria a sub com nome aparado e orderIndex antes da Geral', async () => {
      const response = await POST(createPostRequest({ groupId: 'hab', name: '  Gás  ' }));
      expect(response.status).toBe(200);
      expect(mockPrisma.cashflowItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Gás', orderIndex: 4, groupId: 'hab' }),
        }),
      );
    });

    it.each([
      ['duplicado (sem acento/caixa)', 'ALUGUEL'],
      ['vazio', '   '],
      ['longo', 'x'.repeat(61)],
    ])('422 para nome %s', async (_caso, name) => {
      const response = await POST(createPostRequest({ groupId: 'hab', name }));
      expect(response.status).toBe(422);
      expect(mockPrisma.cashflowItem.create).not.toHaveBeenCalled();
    });

    it('Q15: 409 para linha solta direto em Despesas Fixas, sem personalizar', async () => {
      mockGetGroupForUser.mockResolvedValue({ id: 'fixas', name: 'Despesas Fixas', userId: null });
      const response = await POST(createPostRequest({ groupId: 'fixas', name: 'Solta' }));
      expect(response.status).toBe(409);
      expect(mockPersonalizeGroup).not.toHaveBeenCalled();
      expect(mockPrisma.cashflowItem.create).not.toHaveBeenCalled();
    });

    it('beta sem ativação: sem guardas e sem orderIndex', async () => {
      mockEstadoV2.mockResolvedValue({ estado: 'liberada', ativado: false });
      const response = await POST(createPostRequest({ groupId: 'hab', name: 'ALUGUEL' }));
      expect(response.status).toBe(200);
      expect(mockGetMerged).not.toHaveBeenCalled();
      const { data } = mockPrisma.cashflowItem.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('orderIndex');
    });
  });
});
