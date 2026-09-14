import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  bankTransaction: { count: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  cashflowGroup: { findUnique: vi.fn() },
  cashflowValue: { upsert: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

const mockEnsure = vi.hoisted(() => vi.fn());
vi.mock('@/utils/cashflowPersonalization', () => ({ ensurePersonalizedItem: mockEnsure }));
const mockEstrutura = vi.hoisted(() => vi.fn());
vi.mock('@/utils/cashflowSetup', () => ({ getUserCashflowStructure: mockEstrutura }));

import {
  aplicar,
  desaplicar,
  ignorar,
  indexarEstrutura,
  listarPendentes,
  recomputarCelula,
  resolverSugestao,
} from '../caixaEntrada';

const estrutura = [
  {
    id: 'g-desp',
    name: 'Despesas',
    type: 'despesa',
    items: [],
    children: [
      {
        id: 'g-fixas',
        name: 'Despesas Fixas',
        type: 'despesa',
        items: [],
        children: [
          {
            id: 'g-hab',
            name: 'Habitação',
            type: 'despesa',
            items: [
              { id: 'it-energia', name: 'Conta de energia' },
              { id: 'it-oculto', name: 'Gás', hidden: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'g-ent',
    name: 'Entradas',
    type: 'entrada',
    items: [],
    children: [
      {
        id: 'g-ef',
        name: 'Entradas Fixas',
        type: 'entrada',
        items: [{ id: 'it-sal', name: 'Salário' }],
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cashflowValue.upsert.mockResolvedValue({});
  mockPrisma.cashflowValue.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.bankTransaction.update.mockResolvedValue({});
  mockPrisma.bankTransaction.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ type: 'despesa' });
});

describe('sugestão sobre a árvore do usuário', () => {
  it('resolve o id da linha pelo caminho, ignorando itens ocultos e caixa', () => {
    const idx = indexarEstrutura(estrutura);
    expect(resolverSugestao('Electricity', idx)).toEqual({
      tipo: 'linha',
      itemId: 'it-energia',
      rotulo: 'Despesas Fixas › Habitação › Conta de energia',
    });
    expect(resolverSugestao('Gas', idx)).toMatchObject({ tipo: 'linha', itemId: null });
    expect(resolverSugestao('Salary', idx)).toMatchObject({ itemId: 'it-sal' });
    expect(resolverSugestao('Credit card payment', idx)).toEqual({
      tipo: 'transferencia',
      itemId: null,
      rotulo: null,
    });
  });

  it('listarPendentes pagina e anexa a sugestão', async () => {
    mockPrisma.bankTransaction.count.mockResolvedValue(1);
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      {
        id: 't1',
        accountId: 'a1',
        account: { name: 'Conta Corrente' },
        date: new Date('2026-08-15T00:00:00Z'),
        description: 'ELETROBRAS',
        merchantName: null,
        amount: -185,
        type: 'DEBIT',
        providerCategory: 'Electricity',
      },
    ]);
    mockEstrutura.mockResolvedValue(estrutura);
    const r = await listarPendentes('u1', { page: 2, limit: 10 });
    expect(r).toMatchObject({ total: 1, page: 2, totalPages: 1 });
    expect(r.pendentes[0]).toMatchObject({
      contaNome: 'Conta Corrente',
      amount: -185,
      sugestao: { itemId: 'it-energia' },
    });
    expect(mockPrisma.bankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', deletedAt: null, ignorada: false, cashflowItemId: null },
        skip: 10,
        take: 10,
      }),
    );
  });
});

describe('recomputarCelula', () => {
  it('soma valores absolutos do mês (UTC) e grava a célula', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([{ amount: -185 }, { amount: -120.5 }]);
    const v = await recomputarCelula('u1', { itemId: 'it-energia', year: 2026, month: 7 });
    expect(v).toBe(305.5);
    expect(mockPrisma.bankTransaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        cashflowItemId: 'it-energia',
        deletedAt: null,
        date: { gte: new Date('2026-08-01T00:00:00Z'), lt: new Date('2026-09-01T00:00:00Z') },
      },
      select: { amount: true },
    });
    expect(mockPrisma.cashflowValue.upsert).toHaveBeenCalledWith({
      where: {
        itemId_userId_year_month: { itemId: 'it-energia', userId: 'u1', year: 2026, month: 7 },
      },
      update: { value: 305.5, formula: null },
      create: { itemId: 'it-energia', userId: 'u1', year: 2026, month: 7, value: 305.5 },
    });
  });

  it('sem transações apaga a célula', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([]);
    await recomputarCelula('u1', { itemId: 'it-energia', year: 2026, month: 7 });
    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'it-energia', userId: 'u1', year: 2026, month: 7 },
    });
    expect(mockPrisma.cashflowValue.upsert).not.toHaveBeenCalled();
  });
});

describe('aplicar / desaplicar / ignorar', () => {
  it('personaliza a linha template, grava o vínculo e recomputa as células tocadas', async () => {
    mockPrisma.bankTransaction.findMany
      .mockResolvedValueOnce([
        { id: 't1', date: new Date('2026-08-15T00:00:00Z') },
        { id: 't2', date: new Date('2026-08-20T00:00:00Z') },
      ])
      .mockResolvedValue([{ amount: -185 }, { amount: -120 }]);
    mockEnsure.mockResolvedValue({ itemId: 'it-energia-user', item: { groupId: 'g-hab' } });

    const r = await aplicar('u1', [
      { id: 't1', itemId: 'it-energia' },
      { id: 't2', itemId: 'it-energia' },
    ]);

    expect(mockEnsure).toHaveBeenCalledTimes(1);
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { cashflowItemId: 'it-energia-user', appliedAt: expect.any(Date) },
    });
    expect(r.aplicadas).toBe(2);
    expect(r.celulas).toEqual([{ itemId: 'it-energia-user', year: 2026, month: 7, value: 305 }]);
  });

  it('409 se alguma transação não está pendente; 400 para linha de Investimentos', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValueOnce([]);
    await expect(aplicar('u1', [{ id: 'tx', itemId: 'it' }])).rejects.toMatchObject({
      statusCode: 409,
    });

    mockPrisma.bankTransaction.findMany.mockResolvedValueOnce([{ id: 't1', date: new Date() }]);
    mockEnsure.mockResolvedValue({ itemId: 'it-inv', item: { groupId: 'g-inv' } });
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ type: 'investimento' });
    await expect(aplicar('u1', [{ id: 't1', itemId: 'it-inv' }])).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('desaplicar volta a pendente e recomputa a célula antiga', async () => {
    mockPrisma.bankTransaction.findMany
      .mockResolvedValueOnce([
        { id: 't1', date: new Date('2026-08-15T00:00:00Z'), cashflowItemId: 'it-x' },
      ])
      .mockResolvedValue([]);
    const r = await desaplicar('u1', ['t1']);
    expect(mockPrisma.bankTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1'] } },
      data: { cashflowItemId: null, appliedAt: null },
    });
    expect(r.celulas).toEqual([{ itemId: 'it-x', year: 2026, month: 7, value: 0 }]);
    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalled();
  });

  it('ignorar só toca pendentes do usuário e devolve os ids afetados', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValueOnce([{ id: 't1' }]);
    expect(await ignorar('u1', ['t1', 't9'])).toEqual(['t1']);
    expect(mockPrisma.bankTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1'] } },
      data: { ignorada: true },
    });
    mockPrisma.bankTransaction.findMany.mockResolvedValueOnce([]);
    expect(await ignorar('u1', ['t1'], false)).toEqual([]);
  });
});
