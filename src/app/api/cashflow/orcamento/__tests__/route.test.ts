import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

const mockPrisma = vi.hoisted(() => {
  const prisma = {
    cashflowOrcamento: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    cashflowGroup: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
  return prisma;
});

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockGetMergedCashflowGroups = vi.hoisted(() => vi.fn());
const mockComputeInvestimentosPorMes = vi.hoisted(() => vi.fn());
const mockRecordChange = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));
vi.mock('@/services/cashflow/investimentosPorMes', () => ({
  computeInvestimentosPorMes: mockComputeInvestimentosPorMes,
}));
vi.mock('@/services/changeHistory', () => ({ recordChange: mockRecordChange }));

const sampleTree = () => [
  {
    id: 'entradas',
    userId: null,
    name: 'Entradas',
    type: 'entrada',
    parentId: null,
    orderIndex: 0,
    children: [],
    items: [
      {
        id: 'salario',
        userId: null,
        groupId: 'entradas',
        name: 'Salário',
        significado: null,
        rank: null,
        values: [
          { id: 'v1', itemId: 'salario', userId: 'user-123', year: 2026, month: 0, value: 7500 },
        ],
      },
    ],
  },
  {
    id: 'despesas',
    userId: null,
    name: 'Despesas',
    type: 'despesa',
    parentId: null,
    orderIndex: 1,
    items: [],
    children: [
      {
        id: 'fixas',
        userId: null,
        name: 'Despesas Fixas',
        type: 'despesa',
        parentId: 'despesas',
        orderIndex: 0,
        items: [],
        children: [
          {
            id: 'habitacao',
            userId: null,
            name: 'Habitação',
            type: 'despesa',
            parentId: 'fixas',
            orderIndex: 0,
            children: [],
            items: [
              {
                id: 'aluguel',
                userId: null,
                groupId: 'habitacao',
                name: 'Aluguel',
                significado: null,
                rank: null,
                values: [
                  {
                    id: 'v2',
                    itemId: 'aluguel',
                    userId: 'user-123',
                    year: 2026,
                    month: 0,
                    value: 2000,
                    color: '#FF0000',
                  },
                  {
                    id: 'v3',
                    itemId: 'aluguel',
                    userId: 'user-123',
                    year: 2026,
                    month: 1,
                    value: 2000,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const createGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/cashflow/orcamento');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const req = new NextRequest(url, { method: 'GET' });
  req.cookies.set('token', 'valid-token');
  return req;
};

const createPutRequest = (body: unknown) => {
  const req = new NextRequest(new URL('http://localhost/api/cashflow/orcamento'), {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  req.cookies.set('token', 'valid-token');
  return req;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
  );
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  });
  mockGetMergedCashflowGroups.mockResolvedValue(sampleTree());
  mockComputeInvestimentosPorMes.mockResolvedValue({
    porTipo: {},
    totaisPorMes: [500, ...Array(11).fill(0)],
    planejamentoPorMes: [200, ...Array(11).fill(0)],
    tipos: new Set(['stock']),
  });
  mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([]);
});

describe('GET /api/cashflow/orcamento', () => {
  it('retorna categorias com real nos dois modos e metas anexadas', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([
      { groupId: 'habitacao', tipo: 'grupo', tipoMeta: 'valor', valor: 3500 },
      { groupId: null, tipo: 'investimentos', tipoMeta: 'percentual', valor: 10 },
    ]);

    const response = await GET(createGetRequest({ year: '2026' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.year).toBe(2026);
    const habitacao = data.categorias.find((c: { nome: string }) => c.nome === 'Habitação');
    expect(habitacao.metaMensal).toBe(3500);
    expect(habitacao.realPorMes.lancado[0]).toBe(2000);
    expect(habitacao.realPorMes.lancado[1]).toBe(2000);
    expect(habitacao.realPorMes.consolidado[0]).toBe(2000);
    expect(habitacao.realPorMes.consolidado[1]).toBe(0);
    // Investimentos: real = totaisPorMes + planejamentoPorMes; meta = 10% da renda
    expect(data.investimentos.realPorMes[0]).toBe(700);
    expect(data.investimentos.metaPorMes.lancado[0]).toBe(750);
  });

  it('retorna 400 para year inválido', async () => {
    const response = await GET(createGetRequest({ year: 'abc' }));
    expect(response.status).toBe(400);
  });

  it('retorna 401 sem autenticação', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    const response = await GET(createGetRequest({ year: '2026' }));
    expect(response.status).toBe(401);
  });
});

describe('PUT /api/cashflow/orcamento', () => {
  it('faz upsert de meta de categoria e grava histórico', async () => {
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([{ id: 'habitacao', name: 'Habitação' }]);

    const response = await PUT(
      createPutRequest({ year: 2026, metas: [{ groupId: 'habitacao', valor: 3500 }] }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.cashflowOrcamento.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_year_tipo_groupId: {
            userId: 'user-123',
            year: 2026,
            tipo: 'grupo',
            groupId: 'habitacao',
          },
        },
      }),
    );
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'orcamento.editar', section: 'fluxo-caixa' }),
    );
  });

  it('meta de investimentos: cria quando não existe (update-então-create)', async () => {
    mockPrisma.cashflowOrcamento.updateMany.mockResolvedValue({ count: 0 });

    const response = await PUT(
      createPutRequest({ year: 2026, metas: [{ groupId: null, valor: 10 }] }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.cashflowOrcamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'investimentos', tipoMeta: 'percentual', valor: 10 }),
      }),
    );
  });

  it('rejeita meta percentual acima de 100', async () => {
    const response = await PUT(
      createPutRequest({ year: 2026, metas: [{ groupId: null, valor: 150 }] }),
    );
    expect(response.status).toBe(400);
  });

  it('retorna 404 para categoria inexistente ou de outro usuário', async () => {
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);

    const response = await PUT(
      createPutRequest({ year: 2026, metas: [{ groupId: 'alheio', valor: 100 }] }),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Categoria');
  });

  it('deleta metas de categoria e a linha de investimentos', async () => {
    mockPrisma.cashflowOrcamento.findMany.mockResolvedValue([
      { id: 'o1', groupId: 'habitacao', tipo: 'grupo', tipoMeta: 'valor', valor: 3500 },
      { id: 'o2', groupId: null, tipo: 'investimentos', tipoMeta: 'percentual', valor: 10 },
    ]);

    const response = await PUT(
      createPutRequest({ year: 2026, deletes: ['habitacao', 'investimentos'] }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.cashflowOrcamento.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123', year: 2026, tipo: 'grupo', groupId: { in: ['habitacao'] } },
    });
    expect(mockPrisma.cashflowOrcamento.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123', year: 2026, tipo: 'investimentos' },
    });
  });

  it('body inválido retorna 400', async () => {
    const response = await PUT(createPutRequest({ metas: [{ groupId: 'x', valor: 1 }] }));
    expect(response.status).toBe(400);
  });
});
