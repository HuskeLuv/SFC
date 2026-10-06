import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  bankTransaction: { count: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  cashflowGroup: { findUnique: vi.fn() },
  cashflowValue: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
// $transaction em lote (aplicar) e interativo (recomputarCelula — o tx é o próprio mock).
Object.assign(mockPrisma, {
  $transaction: vi.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma)
      : Promise.all(arg as Promise<unknown>[]),
  ),
});
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
              { id: 'it-divida', name: 'Financiamento', dividaId: 'div-1' },
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
  mockPrisma.cashflowValue.findUnique.mockResolvedValue(null);
  mockPrisma.cashflowValue.create.mockResolvedValue({});
  mockPrisma.cashflowValue.update.mockResolvedValue({});
  mockPrisma.cashflowValue.delete.mockResolvedValue({});
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
    // linha espelho de Dívida nunca é sugerida
    expect([...idx.values()]).not.toContain('it-divida');
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
        where: {
          userId: 'u1',
          deletedAt: null,
          ignorada: false,
          cashflowItemId: null,
          duplicadaDe: null,
        },
        skip: 10,
        take: 10,
      }),
    );
  });
});

describe('recomputarCelula', () => {
  const where = {
    itemId_userId_year_month: { itemId: 'it-energia', userId: 'u1', year: 2026, month: 7 },
  };
  const celula = { itemId: 'it-energia', year: 2026, month: 7 };
  const linha = (value: number, valorBanco: number, extra: Record<string, unknown> = {}) => ({
    value,
    valorBanco,
    color: null,
    comment: null,
    ...extra,
  });

  it('célula vazia: cria com a soma dos valores absolutos do mês (UTC) como parte do banco', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([{ amount: -185 }, { amount: -120.5 }]);
    expect(await recomputarCelula('u1', celula)).toBe(305.5);
    expect(mockPrisma.bankTransaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        cashflowItemId: 'it-energia',
        deletedAt: null,
        duplicadaDe: null,
        date: { gte: new Date('2026-08-01T00:00:00Z'), lt: new Date('2026-09-01T00:00:00Z') },
      },
      select: { amount: true },
    });
    expect(mockPrisma.cashflowValue.create).toHaveBeenCalledWith({
      data: { ...celula, userId: 'u1', value: 305.5, valorBanco: 305.5 },
    });
  });

  it('SOMA ao valor digitado: 874,75 digitados + 30 do banco = 904,75', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([{ amount: -30 }]);
    mockPrisma.cashflowValue.findUnique.mockResolvedValue(
      linha(874.75, 0, { formula: '=800+74,75' }),
    );
    expect(await recomputarCelula('u1', celula)).toBe(904.75);
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledWith({
      where,
      data: { value: 904.75, valorBanco: 30, formula: null },
    });
  });

  it('total editado depois do lançamento: aplica só a diferença da parte do banco', async () => {
    // Banco tinha 10,88; o usuário editou o total para 874,75; entra mais 20 do banco.
    mockPrisma.bankTransaction.findMany.mockResolvedValue([{ amount: -10.88 }, { amount: -20 }]);
    mockPrisma.cashflowValue.findUnique.mockResolvedValue(linha(874.75, 10.88));
    expect(await recomputarCelula('u1', celula)).toBe(894.75);
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledWith({
      where,
      data: { value: 894.75, valorBanco: 30.88, formula: null },
    });
  });

  it('desfazer o lançamento devolve o valor digitado (não apaga a célula)', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([]);
    mockPrisma.cashflowValue.findUnique.mockResolvedValue(linha(904.75, 30));
    expect(await recomputarCelula('u1', celula)).toBe(874.75);
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledWith({
      where,
      data: { value: 874.75, valorBanco: 0, formula: null },
    });
    expect(mockPrisma.cashflowValue.delete).not.toHaveBeenCalled();
  });

  it('célula só do banco: desfazer apaga a linha; com comentário, mantém zerada', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([]);
    mockPrisma.cashflowValue.findUnique.mockResolvedValueOnce(linha(305.5, 305.5));
    expect(await recomputarCelula('u1', celula)).toBe(0);
    expect(mockPrisma.cashflowValue.delete).toHaveBeenCalledWith({ where });

    mockPrisma.cashflowValue.findUnique.mockResolvedValueOnce(
      linha(305.5, 305.5, { comment: 'conferir' }),
    );
    await recomputarCelula('u1', celula);
    expect(mockPrisma.cashflowValue.update).toHaveBeenCalledWith({
      where,
      data: { value: 0, valorBanco: 0, formula: null },
    });
  });

  it('parte do banco igual: não mexe na célula (nem na fórmula)', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([{ amount: -30 }]);
    mockPrisma.cashflowValue.findUnique.mockResolvedValue(linha(904.75, 30));
    expect(await recomputarCelula('u1', celula)).toBe(904.75);
    expect(mockPrisma.cashflowValue.update).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowValue.create).not.toHaveBeenCalled();
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

  it('400 para linha espelho de Sonho ou Dívida (a regeneração apagaria o lançamento)', async () => {
    for (const espelho of [{ objetivoId: 'obj-1' }, { dividaId: 'div-1' }]) {
      mockPrisma.bankTransaction.findMany.mockResolvedValueOnce([{ id: 't1', date: new Date() }]);
      mockEnsure.mockResolvedValueOnce({
        itemId: 'it-espelho',
        item: { groupId: 'g-hab', ...espelho },
      });
      await expect(aplicar('u1', [{ id: 't1', itemId: 'it-espelho' }])).rejects.toMatchObject({
        statusCode: 400,
      });
    }
    expect(mockPrisma.bankTransaction.update).not.toHaveBeenCalled();
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
