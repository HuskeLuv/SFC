import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getMergedCashflowGroups: vi.fn(),
  ensurePersonalizedItem: vi.fn(),
  recomputeEvolucaoSnapshotsSafe: vi.fn(),
  checkOrcamentoAlertasSafe: vi.fn(),
  recordChange: vi.fn(),
  prisma: {
    cashflowValue: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mocks.getMergedCashflowGroups,
}));
vi.mock('@/utils/cashflowPersonalization', () => ({
  ensurePersonalizedItem: mocks.ensurePersonalizedItem,
}));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: mocks.recomputeEvolucaoSnapshotsSafe,
}));
vi.mock('@/services/cashflow/orcamentoAlertas', () => ({
  checkOrcamentoAlertasSafe: mocks.checkOrcamentoAlertasSafe,
}));
vi.mock('@/services/changeHistory', () => ({ recordChange: mocks.recordChange }));
// contexto importa serviços com Prisma; aqui só interessam round e a invalidação do cache.
vi.mock('@/services/assistente/contexto', () => ({
  round: (n: number) => Math.round(n * 100) / 100,
  invalidarContextoUsuario: vi.fn(),
}));

import {
  LINHA_NAO_EDITAVEL,
  aplicarLancamento,
  resolverLancamentoPorItem,
  type LancamentoResolvido,
} from '../lancamentoFluxo';

const grupos = [
  {
    id: 'g-desp',
    name: 'Despesas',
    type: 'despesa',
    items: [],
    children: [
      {
        id: 'g-hab',
        name: 'Habitação',
        type: 'despesa',
        children: [],
        items: [
          {
            id: 'i-super',
            name: 'Supermercado',
            values: [
              { year: 2026, month: 8, value: 1020 },
              { year: 2026, month: 9, value: 300, formula: '=100*3' },
              { year: 2026, month: 10, value: 50 },
            ],
          },
          { id: 'i-sonho', name: 'Viagem', values: [], objetivoId: 'obj-1' },
          { id: 'i-divida', name: 'Financiamento', values: [], dividaId: 'div-1' },
          { id: 'i-oculta', name: 'Pneu', values: [], hidden: true },
        ],
      },
    ],
  },
  {
    id: 'g-inv',
    name: 'Investimentos',
    type: 'investimento',
    children: [],
    items: [{ id: 'i-aporte', name: 'Aporte', values: [] }],
  },
  {
    id: 'g-ent',
    name: 'Entradas',
    type: 'entrada',
    children: [],
    items: [{ id: 'i-salario', name: 'Salário', values: [] }],
  },
];

const auth = {
  payload: { id: 'u1', email: 'a@b.c', role: 'user' as const },
  targetUserId: 'u1',
  actingClient: null,
};
const request = { headers: new Headers() } as unknown as NextRequest;

beforeEach(() => {
  mocks.getMergedCashflowGroups.mockReset().mockResolvedValue(grupos);
  mocks.ensurePersonalizedItem.mockReset().mockResolvedValue({ itemId: 'i-super-user', item: {} });
  mocks.prisma.$transaction
    .mockReset()
    .mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
  mocks.prisma.cashflowValue.findUnique.mockReset();
  mocks.prisma.cashflowValue.upsert.mockReset().mockResolvedValue({});
  mocks.recordChange.mockReset().mockResolvedValue('log-1');
  mocks.recomputeEvolucaoSnapshotsSafe.mockReset();
  mocks.checkOrcamentoAlertasSafe.mockReset();
});

describe('resolverLancamentoPorItem', () => {
  it('único: soma ao valor atual do mês', async () => {
    const r = await resolverLancamentoPorItem('u1', {
      itemId: 'i-super',
      valor: 45.9,
      ano: 2026,
      mes: 8,
      recorrente: false,
    });
    expect(mocks.getMergedCashflowGroups).toHaveBeenCalledWith('u1', 2026);
    expect(r).toEqual({
      ok: true,
      mesesComFormula: [],
      lancamento: {
        userId: 'u1',
        itemId: 'i-super',
        itemNome: 'Supermercado',
        grupoNome: 'Despesas > Habitação',
        tipo: 'despesa',
        valor: 45.9,
        ano: 2026,
        descricao: null,
        modo: 'somar',
        celulas: [{ mes: 8, valorAtual: 1020, valorNovo: 1065.9 }],
      },
    });
  });

  it('recorrente: define de mes até mesFim e marca as células com fórmula', async () => {
    const r = await resolverLancamentoPorItem('u1', {
      itemId: 'i-super',
      valor: 100,
      ano: 2026,
      mes: 8,
      recorrente: true,
      mesFim: 10,
      descricao: '  feira  ',
    });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.lancamento.modo).toBe('definir');
    expect(r.lancamento.descricao).toBe('feira');
    expect(r.lancamento.celulas).toEqual([
      { mes: 8, valorAtual: 1020, valorNovo: 100 },
      { mes: 9, valorAtual: 300, valorNovo: 100 },
      { mes: 10, valorAtual: 50, valorNovo: 100 },
    ]);
    expect(r.mesesComFormula).toEqual([9]);
  });

  it('recorrente sem mesFim vai até dezembro', async () => {
    const r = await resolverLancamentoPorItem('u1', {
      itemId: 'i-salario',
      valor: 5000,
      ano: 2026,
      mes: 9,
      recorrente: true,
    });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.lancamento.celulas.map((c) => c.mes)).toEqual([9, 10, 11]);
    expect(r.lancamento.tipo).toBe('entrada');
  });

  it.each([
    ['sonho', 'i-sonho'],
    ['dívida', 'i-divida'],
    ['oculta', 'i-oculta'],
    ['investimento', 'i-aporte'],
    ['fora da árvore (outro usuário)', 'i-de-outro'],
  ])('recusa linha %s', async (_nome, itemId) => {
    const r = await resolverLancamentoPorItem('u1', {
      itemId,
      valor: 10,
      ano: 2026,
      mes: 0,
      recorrente: false,
    });
    expect(r).toEqual({ ok: false, motivo: LINHA_NAO_EDITAVEL });
  });
});

describe('aplicarLancamento (lançamento rápido)', () => {
  const unico: LancamentoResolvido = {
    userId: 'u1',
    itemId: 'i-super',
    itemNome: 'Supermercado',
    grupoNome: 'Despesas > Habitação',
    tipo: 'despesa',
    valor: 45.9,
    ano: 2026,
    descricao: null,
    modo: 'somar',
    celulas: [{ mes: 8, valorAtual: 1020, valorNovo: 1065.9 }],
  };
  const opcoes = { origem: 'lancamento-rapido', carimbar: 'com-descricao' } as const;

  it('sem descrição: grava o valor sem tocar no comentário e devolve o changeLogId', async () => {
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue({
      value: 1020,
      comment: 'antigo',
      formula: '=1000+20',
    });
    const r = await aplicarLancamento(auth, request, unico, opcoes);
    expect(r).toEqual({
      itemId: 'i-super-user',
      celulas: [{ mes: 8, valorAnterior: 1020, valorNovo: 1065.9 }],
      changeLogId: 'log-1',
    });
    const upsert = mocks.prisma.cashflowValue.upsert.mock.calls[0][0];
    expect(upsert.update).toEqual({ value: 1065.9, formula: null });
    expect(upsert.create).not.toHaveProperty('comment');
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'valor.editar',
        entityId: 'i-super-user',
        entityLabel: 'Supermercado · setembro/2026 (lançamento rápido)',
        snapshot: expect.objectContaining({
          kind: 'cashflow-valor',
          data: { value: 1020 },
          meta: { itemId: 'i-super-user', year: 2026, month: 8, origem: 'lancamento-rapido' },
        }),
      }),
    );
    expect(mocks.recomputeEvolucaoSnapshotsSafe).toHaveBeenCalledWith('u1', new Date(2026, 8, 1));
    expect(mocks.checkOrcamentoAlertasSafe).toHaveBeenCalledWith('u1');
  });

  it('com descrição: carimba "(lançamento rápido)" no comentário', async () => {
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue({ value: 1020, comment: 'antigo' });
    await aplicarLancamento(auth, request, { ...unico, descricao: 'pão' }, opcoes);
    const upsert = mocks.prisma.cashflowValue.upsert.mock.calls[0][0];
    expect(upsert.update.comment).toBe('antigo\nGasto de R$ 45,90 — pão (lançamento rápido)');
  });

  it('assistente (carimbar sempre): mantém o carimbo sem descrição', async () => {
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue(null);
    await aplicarLancamento(auth, request, unico, { origem: 'assistente', carimbar: 'sempre' });
    const upsert = mocks.prisma.cashflowValue.upsert.mock.calls[0][0];
    expect(upsert.create.comment).toBe('Gasto de R$ 45,90 (assistente)');
  });

  it("'definir' não mexe em célula que já vale o valor e registra UMA entrada recorrente", async () => {
    mocks.prisma.cashflowValue.findUnique
      .mockResolvedValueOnce({ value: 100, comment: null }) // igual → intocada
      .mockResolvedValueOnce({ value: 300, comment: null, formula: '=100*3' })
      .mockResolvedValueOnce(null);
    const r = await aplicarLancamento(
      auth,
      request,
      {
        ...unico,
        valor: 100,
        modo: 'definir',
        celulas: [
          { mes: 8, valorAtual: 100, valorNovo: 100 },
          { mes: 9, valorAtual: 300, valorNovo: 100 },
          { mes: 10, valorAtual: 0, valorNovo: 100 },
        ],
      },
      opcoes,
    );
    expect(r.changeLogId).toBe('log-1');
    const upserts = mocks.prisma.cashflowValue.upsert.mock.calls.map((c) => c[0]);
    expect(upserts).toHaveLength(2);
    expect(upserts.map((u) => u.where.itemId_userId_year_month.month)).toEqual([9, 10]);
    expect(mocks.recordChange).toHaveBeenCalledTimes(1);
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'valores.editar-recorrente',
        entityLabel: 'Supermercado · setembro a novembro/2026 (lançamento rápido)',
        snapshot: expect.objectContaining({
          data: {
            celulas: [
              { month: 9, before: 300, after: 100 },
              { month: 10, before: null, after: 100 },
            ],
          },
          meta: {
            itemId: 'i-super-user',
            year: 2026,
            origem: 'lancamento-rapido',
            modo: 'definir',
          },
        }),
      }),
    );
  });

  it('nada a mudar: sem histórico e sem changeLogId', async () => {
    mocks.prisma.cashflowValue.findUnique.mockResolvedValue({ value: 100, comment: null });
    const r = await aplicarLancamento(
      auth,
      request,
      {
        ...unico,
        valor: 100,
        modo: 'definir',
        celulas: [{ mes: 8, valorAtual: 100, valorNovo: 100 }],
      },
      opcoes,
    );
    expect(r).not.toHaveProperty('changeLogId');
    expect(mocks.recordChange).not.toHaveBeenCalled();
    expect(mocks.recomputeEvolucaoSnapshotsSafe).not.toHaveBeenCalled();
  });
});
