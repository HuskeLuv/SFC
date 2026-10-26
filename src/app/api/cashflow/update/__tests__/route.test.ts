import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), create: vi.fn() },
  cashflowItem: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  cashflowValue: { findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockPersonalization = vi.hoisted(() => ({
  personalizeGroup: vi.fn(),
  personalizeItem: vi.fn(),
  getItemForUser: vi.fn(),
  getGroupForUser: vi.fn(),
  resolveOwnedGroupId: vi.fn(),
  hideTemplateGroup: vi.fn(),
  hideTemplateItem: vi.fn(),
}));
const mockRecordChange = vi.hoisted(() => vi.fn());
const mockEstadoV2 = vi.hoisted(() => vi.fn());
const mockGetMerged = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/cashflowPersonalization', () => mockPersonalization);
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn(),
  logDataUpdate: vi.fn(),
}));
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
const mockGarantirGerais = vi.hoisted(() => vi.fn());
vi.mock('@/services/cashflow/orcamentoV2/ativacao', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/cashflow/orcamentoV2/ativacao')>();
  return { ...original, garantirGerais: mockGarantirGerais };
});
const mockExecutarExclusao = vi.hoisted(() => vi.fn());
const mockTratarOrcados = vi.hoisted(() => vi.fn());
vi.mock('@/services/cashflow/orcamentoV2/excluirSubcategoria', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/cashflow/orcamentoV2/excluirSubcategoria')>();
  return {
    ...original,
    executarExclusaoSubcategoria: mockExecutarExclusao,
    tratarOrcadosAntesDeApagarItem: mockTratarOrcados,
  };
});

import { PATCH } from '../route';
import { ErroExclusaoSubcategoria } from '@/services/cashflow/orcamentoV2/excluirSubcategoria';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/cashflow/update', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const itemRow = (extra: Record<string, unknown> = {}) => ({
  id: 'aluguel',
  userId: 'user-1',
  groupId: 'hab',
  name: 'Aluguel',
  significado: null,
  rank: null,
  templateId: null,
  hidden: false,
  objetivoId: null,
  dividaId: null,
  isGeral: false,
  ...extra,
});

const geralRow = () => itemRow({ id: 'geral-hab', name: 'Geral', isGeral: true });

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
              { id: 'aluguel', name: 'Aluguel', orderIndex: 2 },
              { id: 'luz', name: 'Energia', orderIndex: 5 },
              { id: 'geral-hab', name: 'Geral', orderIndex: 0, isGeral: true },
            ],
            children: [],
          },
        ],
      },
    ],
  },
];

const ativarV2 = () => {
  mockEstadoV2.mockResolvedValue({ estado: 'liberada', ativado: true });
  mockGetMerged.mockResolvedValue(arvore());
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
  mockEstadoV2.mockResolvedValue({ estado: 'desligada', ativado: false });
  mockExecutarExclusao.mockResolvedValue(null);
  mockPrisma.cashflowItem.findUnique.mockResolvedValue({ group: { type: 'despesa' } });
  mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ type: 'despesa' });
  mockPrisma.cashflowItem.update.mockImplementation(async ({ data }) => ({
    ...itemRow(),
    ...data,
    values: [],
  }));
  mockPrisma.cashflowItem.create.mockImplementation(async ({ data }) => ({
    id: 'novo',
    ...data,
    values: [],
  }));
  mockPrisma.cashflowValue.findMany.mockResolvedValue([]);
  mockPersonalization.getGroupForUser.mockResolvedValue({
    id: 'hab',
    userId: 'user-1',
    name: 'Habitação',
  });
  mockPersonalization.hideTemplateGroup.mockResolvedValue('tomb-1');
  mockRecordChange.mockResolvedValue(undefined);
  mockGarantirGerais.mockResolvedValue({ criadas: [], adotadas: [] });
  mockPrisma.cashflowGroup.create.mockImplementation(async ({ data }) => ({
    id: 'grupo-novo',
    ...data,
    items: [],
    children: [],
  }));
});

const criarGrupo = (type: string) =>
  PATCH(req({ operation: 'create', type: 'group', data: { name: 'Pets', type } }));

describe('PATCH /api/cashflow/update — criar grupo × Geral do Orçamento v2 (§6.2)', () => {
  it('sem v2: cria o grupo sem garantir Geral', async () => {
    const res = await criarGrupo('despesa');
    expect(res.status).toBe(200);
    expect(mockGarantirGerais).not.toHaveBeenCalled();
  });

  it('ativado: grupo de despesa → garantirGerais depois de criar', async () => {
    ativarV2();
    const res = await criarGrupo('despesa');
    expect(res.status).toBe(200);
    expect(mockGarantirGerais).toHaveBeenCalledWith('user-1');
    expect(mockPrisma.cashflowGroup.create.mock.invocationCallOrder[0]).toBeLessThan(
      mockGarantirGerais.mock.invocationCallOrder[0],
    );
  });

  it('ativado: grupo de entrada não garante Geral', async () => {
    ativarV2();
    await criarGrupo('entrada');
    expect(mockGarantirGerais).not.toHaveBeenCalled();
  });

  it('falha ao garantir a Geral não desfaz a criação (o GET garante de novo)', async () => {
    ativarV2();
    mockGarantirGerais.mockRejectedValue(new Error('boom'));
    const res = await criarGrupo('despesa');
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/cashflow/update — usuário sem Orçamento v2 (como antes)', () => {
  it('excluir item comum não passa pela fusão', async () => {
    mockPrisma.cashflowItem.findUnique
      .mockResolvedValueOnce({ group: { type: 'despesa' } })
      .mockResolvedValueOnce(itemRow());
    const res = await PATCH(req({ operation: 'delete', type: 'item', id: 'aluguel' }));
    expect(res.status).toBe(200);
    expect(mockExecutarExclusao).not.toHaveBeenCalled();
  });

  it('item com orçado v2 (ativado com a flag desligada) funde em vez de bater no FK', async () => {
    mockPrisma.cashflowItem.findUnique
      .mockResolvedValueOnce({ group: { type: 'despesa' } })
      .mockResolvedValueOnce(itemRow({ _count: { orcamentoItens: 1 } }));
    mockExecutarExclusao.mockResolvedValue({ itemId: 'aluguel' });
    const res = await PATCH(req({ operation: 'delete', type: 'item', id: 'aluguel' }));
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('espelho de sonho com orçado: trata os orçados antes de apagar (sem bater no FK)', async () => {
    mockPrisma.cashflowItem.findUnique
      .mockResolvedValueOnce({ group: { type: 'despesa' } })
      .mockResolvedValueOnce(itemRow({ objetivoId: 'obj-1', _count: { orcamentoItens: 2 } }));
    const ordem: string[] = [];
    mockTratarOrcados.mockImplementation(async () => {
      ordem.push('orcados');
      return { somados: 1, apagados: 1 };
    });
    mockPrisma.$transaction.mockImplementationOnce(async (ops: unknown[]) => {
      ordem.push('delete');
      return ops;
    });
    const res = await PATCH(req({ operation: 'delete', type: 'item', id: 'aluguel' }));
    expect(res.status).toBe(200);
    expect(mockExecutarExclusao).toHaveBeenCalled();
    expect(mockTratarOrcados).toHaveBeenCalledWith('user-1', 'aluguel');
    expect(ordem).toEqual(['orcados', 'delete']);
  });

  it('renomeia item sem consultar a árvore nem validar nome', async () => {
    mockPersonalization.getItemForUser.mockResolvedValue(itemRow());
    const res = await PATCH(
      req({ operation: 'update', type: 'item', id: 'aluguel', data: { name: '  Energia ' } }),
    );
    expect(res.status).toBe(200);
    expect(mockGetMerged).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: '  Energia ' }) }),
    );
  });

  it('oculta grupo-template de categoria padrão', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({
      id: 'tpl-hab',
      userId: null,
      name: 'Habitação',
      type: 'despesa',
      templateId: null,
    });
    const res = await PATCH(req({ operation: 'delete', type: 'group', id: 'tpl-hab' }));
    expect(res.status).toBe(200);
    expect(mockPersonalization.hideTemplateGroup).toHaveBeenCalledWith('tpl-hab', 'user-1');
  });

  it('cria item sem orderIndex', async () => {
    const res = await PATCH(
      req({ operation: 'create', type: 'item', data: { groupId: 'hab', name: 'Gás' } }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.cashflowItem.create.mock.calls[0][0].data).not.toHaveProperty('orderIndex');
  });
});

describe('PATCH /api/cashflow/update — Geral (por dado)', () => {
  it('409 ao renomear a Geral; reenviar o mesmo nome passa', async () => {
    mockPersonalization.getItemForUser.mockResolvedValue(geralRow());
    const res = await PATCH(
      req({ operation: 'update', type: 'item', id: 'geral-hab', data: { name: 'Outros' } }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('A subcategoria Geral não pode ser renomeada');
    expect(mockPrisma.cashflowItem.update).not.toHaveBeenCalled();

    const igual = await PATCH(
      req({
        operation: 'update',
        type: 'item',
        id: 'geral-hab',
        data: { name: 'Geral', significado: 'x' },
      }),
    );
    expect(igual.status).toBe(200);
  });

  it('409 ao mover a Geral de grupo', async () => {
    mockPersonalization.getItemForUser.mockResolvedValue(geralRow());
    const res = await PATCH(
      req({ operation: 'update', type: 'item', id: 'geral-hab', data: { groupId: 'outro' } }),
    );
    expect(res.status).toBe(409);
    expect(mockPersonalization.resolveOwnedGroupId).not.toHaveBeenCalled();
  });

  it('409 ao excluir a Geral', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue(geralRow());
    const res = await PATCH(req({ operation: 'delete', type: 'item', id: 'geral-hab' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('A subcategoria Geral não pode ser excluída');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/cashflow/update — usuário ativado no v2', () => {
  beforeEach(ativarV2);

  it.each([
    ['duplicado', 'ENERGIA'],
    ['vazio', '   '],
    ['longo', 'x'.repeat(61)],
  ])('422 ao renomear sub com nome %s', async (_caso, name) => {
    mockPersonalization.getItemForUser.mockResolvedValue(itemRow());
    const res = await PATCH(
      req({ operation: 'update', type: 'item', id: 'aluguel', data: { name } }),
    );
    expect(res.status).toBe(422);
    expect(mockPrisma.cashflowItem.update).not.toHaveBeenCalled();
    expect(mockPersonalization.personalizeItem).not.toHaveBeenCalled();
  });

  it('renomeia com o nome aparado', async () => {
    mockPersonalization.getItemForUser.mockResolvedValue(itemRow());
    const res = await PATCH(
      req({ operation: 'update', type: 'item', id: 'aluguel', data: { name: ' Condomínio ' } }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Condomínio' }) }),
    );
  });

  it('cria sub antes da Geral e recusa linha solta em Despesas Fixas (Q15)', async () => {
    const ok = await PATCH(
      req({ operation: 'create', type: 'item', data: { groupId: 'hab', name: 'Gás' } }),
    );
    expect(ok.status).toBe(200);
    expect(mockPrisma.cashflowItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Gás', orderIndex: 6 }) }),
    );

    mockPersonalization.getGroupForUser.mockResolvedValue({
      id: 'fixas',
      userId: null,
      name: 'Despesas Fixas',
    });
    const solta = await PATCH(
      req({ operation: 'create', type: 'item', data: { groupId: 'fixas', name: 'Solta' } }),
    );
    expect(solta.status).toBe(409);
    expect(mockPersonalization.personalizeGroup).not.toHaveBeenCalled();
  });

  it('409 ao excluir categoria de sistema (template ou override dela)', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValueOnce({ type: 'despesa' }); // touchesInvestimentoGroup
    mockPrisma.cashflowGroup.findUnique.mockResolvedValueOnce({
      id: 'tpl-hab',
      userId: null,
      name: 'Habitação',
      type: 'despesa',
      templateId: null,
    });
    const tpl = await PATCH(req({ operation: 'delete', type: 'group', id: 'tpl-hab' }));
    expect(tpl.status).toBe(409);
    expect(mockPersonalization.hideTemplateGroup).not.toHaveBeenCalled();

    mockPrisma.cashflowGroup.findUnique
      .mockResolvedValueOnce({ type: 'despesa' })
      .mockResolvedValueOnce({
        id: 'hab',
        userId: 'user-1',
        name: 'Minha Casa',
        type: 'despesa',
        templateId: 'tpl-hab',
      })
      .mockResolvedValueOnce({ name: 'Habitação' }); // nome do template
    const ovr = await PATCH(req({ operation: 'delete', type: 'group', id: 'hab' }));
    expect(ovr.status).toBe(409);
    expect(mockPrisma.cashflowGroup.delete).not.toHaveBeenCalled();
  });

  it('grupo criado pelo usuário continua excluível', async () => {
    mockPrisma.cashflowGroup.findUnique
      .mockResolvedValueOnce({ type: 'despesa' })
      .mockResolvedValueOnce({
        id: 'viagens',
        userId: 'user-1',
        name: 'Viagens',
        type: 'despesa',
        templateId: null,
        parentId: null,
        orderIndex: 0,
        hidden: false,
      });
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.cashflowItem.count.mockResolvedValue(0);
    const res = await PATCH(req({ operation: 'delete', type: 'group', id: 'viagens' }));
    expect(res.status).toBe(200);
    expect(mockPrisma.cashflowGroup.delete).toHaveBeenCalledWith({ where: { id: 'viagens' } });
  });

  it('excluir sub: funde na Geral e o histórico é o da fusão (sem item.excluir duplicado)', async () => {
    mockPrisma.cashflowItem.findUnique
      .mockResolvedValueOnce({ group: { type: 'despesa' } })
      .mockResolvedValueOnce(itemRow());
    mockExecutarExclusao.mockResolvedValue({ itemId: 'aluguel' });
    const res = await PATCH(req({ operation: 'delete', type: 'item', id: 'aluguel' }));
    expect(res.status).toBe(200);
    expect(mockExecutarExclusao).toHaveBeenCalledWith(
      'user-1',
      'aluguel',
      expect.objectContaining({ delegacao: true, contexto: expect.any(Object) }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRecordChange).not.toHaveBeenCalled();
  });

  it('excluir item: fusão não se aplica → a exclusão segue igual', async () => {
    mockPrisma.cashflowItem.findUnique
      .mockResolvedValueOnce({ group: { type: 'despesa' } })
      .mockResolvedValueOnce(itemRow());
    const res = await PATCH(req({ operation: 'delete', type: 'item', id: 'aluguel' }));
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('excluir sub com cores divergentes → 409 com os meses', async () => {
    mockPrisma.cashflowItem.findUnique
      .mockResolvedValueOnce({ group: { type: 'despesa' } })
      .mockResolvedValueOnce(itemRow());
    mockExecutarExclusao.mockRejectedValue(
      new ErroExclusaoSubcategoria('cores_divergentes', [{ ano: 2026, mes: 2 }]),
    );
    const res = await PATCH(req({ operation: 'delete', type: 'item', id: 'aluguel' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ details: { coresDivergentes: ['2026-03'] } });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
