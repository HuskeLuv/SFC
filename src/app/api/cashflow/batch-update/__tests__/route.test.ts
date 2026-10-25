import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  cashflowValue: { deleteMany: vi.fn(), upsert: vi.fn() },
  planejamentoObjetivo: { findFirst: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockEnsurePersonalizedItem = vi.hoisted(() => vi.fn());
const mockHideTemplateItem = vi.hoisted(() => vi.fn());
const mockRecordChange = vi.hoisted(() => vi.fn());
const mockEstadoV2 = vi.hoisted(() => vi.fn());
const mockGetMerged = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/cashflowPersonalization', () => ({
  ensurePersonalizedItem: mockEnsurePersonalizedItem,
  hideTemplateItem: mockHideTemplateItem,
}));
vi.mock('@/services/impersonationLogger', () => ({ logSensitiveEndpointAccess: vi.fn() }));
vi.mock('@/services/planejamento/cashflowToSonhoSync', () => ({
  syncCashflowToObjetivo: vi.fn(),
}));
vi.mock('@/services/planejamento/sonhoCashflowSync', () => ({ removeObjetivoCashflow: vi.fn() }));
vi.mock('@/services/cashflow/orcamentoAlertas', () => ({ checkOrcamentoAlertasSafe: vi.fn() }));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: vi.fn(),
}));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  invalidatePortfolioSnapshots: vi.fn(),
}));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...original, recordChange: mockRecordChange };
});
vi.mock('@/services/cashflow/orcamentoV2/acesso', () => ({
  estadoAcessoOrcamentoV2: mockEstadoV2,
}));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMerged,
}));

import { PUT } from '../route';

const req = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/cashflow/batch-update', {
    method: 'PUT',
    body: JSON.stringify({ groupId: 'hab', year: 2026, ...body }),
    headers: { 'Content-Type': 'application/json' },
  });

const ownedRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  significado: null,
  rank: null,
  templateId: null,
  objetivoId: null,
  dividaId: null,
  isGeral: false,
  group: { type: 'despesa', templateId: null },
  ...extra,
});

// Árvore mesclada sintética: Despesas > Despesas Fixas > Habitação (override, com Geral).
const arvore = () => [
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
            userId: 'user-1',
            templateId: 'tpl-hab',
            items: [
              { id: 'aluguel', name: 'Aluguel' },
              { id: 'luz', name: 'Energia' },
              { id: 'geral-hab', name: 'Geral', isGeral: true },
            ],
            children: [],
          },
        ],
      },
    ],
  },
];

/** `linked` do update: o findUnique logo depois de personalizar. */
const linkedRow = (extra: Record<string, unknown> = {}) => ({
  objetivoId: null,
  dividaId: null,
  name: 'Aluguel',
  isGeral: false,
  objetivo: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
  mockEstadoV2.mockResolvedValue({ estado: 'desligada', ativado: false });
  mockGetMerged.mockResolvedValue([]);
  mockEnsurePersonalizedItem.mockImplementation(async (id: string) => ({ itemId: id }));
  mockPrisma.cashflowItem.findUnique.mockResolvedValue(linkedRow());
  mockPrisma.cashflowItem.update.mockResolvedValue({});
  mockPrisma.cashflowItem.count.mockResolvedValue(0);
  mockPrisma.cashflowValue.upsert.mockResolvedValue({});
  mockRecordChange.mockResolvedValue(undefined);
});

describe('PUT /api/cashflow/batch-update — Geral (por dado, recusa parcial)', () => {
  it('não exclui a Geral; as demais linhas do lote são excluídas', async () => {
    mockPrisma.cashflowItem.findMany.mockResolvedValue([
      ownedRow('livre'),
      ownedRow('geral-hab', { name: 'Geral', isGeral: true }),
    ]);
    const res = await PUT(req({ updates: [], deletes: ['livre', 'geral-hab'] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results).toEqual(
      expect.arrayContaining([
        { itemId: 'livre', success: true },
        {
          itemId: 'geral-hab',
          success: false,
          error: 'A subcategoria Geral não pode ser excluída',
        },
      ]),
    );
    expect(body.results).toHaveLength(2);
    expect(mockPrisma.cashflowItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['livre'] }, userId: 'user-1' },
    });
  });

  it('não renomeia a Geral; reenviar o mesmo nome com valores salva os valores', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(
      linkedRow({ name: 'Geral', isGeral: true }),
    );
    const recusa = await PUT(
      req({
        updates: [{ itemId: 'geral-hab', name: 'Outros', values: [{ month: 0, value: 10 }] }],
        deletes: [],
      }),
    );
    expect((await recusa.json()).results).toEqual([
      { itemId: 'geral-hab', success: false, error: 'A subcategoria Geral não pode ser renomeada' },
    ]);
    expect(mockPrisma.cashflowItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();

    const igual = await PUT(
      req({
        updates: [{ itemId: 'geral-hab', name: 'Geral', values: [{ month: 0, value: 10 }] }],
        deletes: [],
      }),
    );
    expect((await igual.json()).results).toEqual([{ itemId: 'geral-hab', success: true }]);
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/cashflow/batch-update — usuário sem Orçamento v2 (como antes)', () => {
  it('renomeia sem validar nome e só carrega a árvore da resposta', async () => {
    const res = await PUT(req({ updates: [{ itemId: 'aluguel', name: '  energia ' }] }));
    expect((await res.json()).results).toEqual([{ itemId: 'aluguel', success: true }]);
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'aluguel', userId: 'user-1' },
      data: { name: '  energia ' },
    });
    expect(mockGetMerged).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/cashflow/batch-update — usuário ativado no v2', () => {
  beforeEach(() => {
    mockEstadoV2.mockResolvedValue({ estado: 'liberada', ativado: true });
    mockGetMerged.mockResolvedValue(arvore());
  });

  it('recusa parcial para nome duplicado/vazio/longo; o resto do lote salva', async () => {
    const res = await PUT(
      req({
        updates: [
          { itemId: 'aluguel', name: 'ENERGIA' },
          { itemId: 'luz', name: '   ' },
          { itemId: 'aluguel', name: '' },
          { itemId: 'geral-hab', name: 'x'.repeat(61) },
          { itemId: 'aluguel', values: [{ month: 1, value: 5 }] },
        ],
      }),
    );
    const { results } = await res.json();
    expect(results).toEqual([
      {
        itemId: 'aluguel',
        success: false,
        error: 'Já existe uma subcategoria com esse nome nesta categoria',
      },
      { itemId: 'luz', success: false, error: 'Informe o nome da subcategoria' },
      { itemId: 'aluguel', success: false, error: 'Informe o nome da subcategoria' },
      { itemId: 'geral-hab', success: false, error: 'A subcategoria Geral não pode ser renomeada' },
      { itemId: 'aluguel', success: true },
    ]);
    expect(mockPrisma.cashflowItem.update).not.toHaveBeenCalled();
    expect(mockEnsurePersonalizedItem).toHaveBeenCalledTimes(1);
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledTimes(1);
  });

  it('grava o nome aparado e enxerga renomeações anteriores do mesmo lote', async () => {
    const res = await PUT(
      req({
        updates: [
          { itemId: 'aluguel', name: ' Gás ' },
          { itemId: 'luz', name: 'gas' },
        ],
      }),
    );
    const { results } = await res.json();
    expect(results[0]).toEqual({ itemId: 'aluguel', success: true });
    expect(results[1]).toMatchObject({ itemId: 'luz', success: false });
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith({
      where: { id: 'aluguel', userId: 'user-1' },
      data: { name: 'Gás' },
    });
    // Uma árvore para as guardas + a da resposta.
    expect(mockGetMerged).toHaveBeenCalledTimes(2);
  });

  it('excluir: o stub da fusão devolve nao_aplica e a exclusão segue igual', async () => {
    mockPrisma.cashflowItem.findMany.mockResolvedValue([ownedRow('aluguel')]);
    const res = await PUT(req({ updates: [], deletes: ['aluguel'] }));
    expect((await res.json()).results).toEqual([{ itemId: 'aluguel', success: true }]);
    expect(mockPrisma.cashflowItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['aluguel'] }, userId: 'user-1' },
    });
  });
});
