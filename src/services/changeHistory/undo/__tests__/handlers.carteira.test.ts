import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  portfolio: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  fixedIncomeAsset: { findUnique: vi.fn(), create: vi.fn() },
  asset: { findUnique: vi.fn() },
  planejamentoObjetivo: { findUnique: vi.fn() },
  portfolioProvento: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  dashboardData: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

const mockRecalc = vi.hoisted(() => vi.fn());
const mockInvalidateSnapshots = vi.hoisted(() => vi.fn());
const mockSyncSonho = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: mockRecalc,
  invalidatePortfolioSnapshots: mockInvalidateSnapshots,
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: mockSyncSonho,
}));

import { CARTEIRA_UNDO_HANDLERS } from '../handlers/carteira';
import { UndoError } from '../types';

const auth = { payload: { id: 'user-1' }, targetUserId: 'user-1', actingClient: null };
const request = new NextRequest('http://localhost/api/historico-alteracoes/log-1/undo', {
  method: 'POST',
});

const makeEntry = (overrides: Partial<UserChangeLog>): UserChangeLog =>
  ({
    id: 'log-1',
    userId: 'user-1',
    actorId: 'user-1',
    viaConsultant: false,
    section: 'carteira',
    action: 'transacao.editar',
    entity: 'transacao',
    entityId: 'tx-1',
    entityLabel: 'PETR4',
    changes: null,
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-07-10T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('transacao.editar (restore-fields)', () => {
  const changes = [
    { field: 'quantity', label: 'Quantidade', before: 100, after: 150 },
    { field: 'total', label: 'Total', before: 1000, after: 1500 },
  ];
  const tx = {
    id: 'tx-1',
    userId: 'user-1',
    assetId: 'asset-1',
    quantity: 150,
    price: 10,
    total: 1500,
    date: new Date('2026-06-01T00:00:00Z'),
  };

  it('restaura os valores before, recalcula e sincroniza sonho', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(tx);
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });

    const outcome = await CARTEIRA_UNDO_HANDLERS['transacao.editar'].execute({
      request,
      auth,
      entry: makeEntry({ changes: changes as never }),
    });

    expect(mockPrisma.stockTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { quantity: 100, total: 1000 },
    });
    expect(mockRecalc).toHaveBeenCalledWith({
      targetUserId: 'user-1',
      assetId: 'asset-1',
      portfolioId: 'port-1',
      recomputeSnapshotsFrom: tx.date,
    });
    expect(mockSyncSonho).toHaveBeenCalledWith('user-1', { assetId: 'asset-1' });
    // Diff invertido pra entrada .desfazer
    expect(outcome.changes).toEqual([
      { field: 'quantity', label: 'Quantidade', before: 150, after: 100 },
      { field: 'total', label: 'Total', before: 1500, after: 1000 },
    ]);
  });

  it('usa min(data restaurada, data atual) como cutoff quando date muda', async () => {
    const dateChanges = [
      {
        field: 'date',
        label: 'Data',
        before: '2026-05-01T00:00:00.000Z',
        after: '2026-06-01T00:00:00.000Z',
      },
    ];
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(tx);
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });

    await CARTEIRA_UNDO_HANDLERS['transacao.editar'].execute({
      request,
      auth,
      entry: makeEntry({ changes: dateChanges as never }),
    });

    expect(mockRecalc).toHaveBeenCalledWith(
      expect.objectContaining({ recomputeSnapshotsFrom: new Date('2026-05-01T00:00:00.000Z') }),
    );
  });

  it('409 quando o estado atual não bate com o after (checagem otimista)', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({ ...tx, quantity: 999 });

    await expect(
      CARTEIRA_UNDO_HANDLERS['transacao.editar'].execute({
        request,
        auth,
        entry: makeEntry({ changes: changes as never }),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.stockTransaction.update).not.toHaveBeenCalled();
  });

  it('409 quando a transação foi excluída depois', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['transacao.editar'].execute({
        request,
        auth,
        entry: makeEntry({ changes: changes as never }),
      }),
    ).rejects.toBeInstanceOf(UndoError);
  });
});

describe('transacao.excluir (recreate-from-snapshot)', () => {
  const snapshot = {
    v: 1,
    kind: 'transacao',
    data: {
      id: 'tx-1',
      assetId: 'asset-1',
      type: 'compra',
      quantity: 100,
      price: 10,
      total: 1000,
      date: '2026-06-01T00:00:00.000Z',
      fees: null,
      notes: null,
    },
    meta: {
      portfolio: { id: 'port-1', assetId: 'asset-1', objetivo: 5, vinculoAposentadoria: false },
      fixedIncome: {
        type: 'CDB',
        description: 'CDB Teste',
        startDate: '2026-06-01T00:00:00.000Z',
        maturityDate: '2027-06-01T00:00:00.000Z',
        investedAmount: 1000,
        annualRate: 12,
        indexer: 'CDI',
        indexerPercent: 100,
        liquidityType: null,
        taxExempt: false,
        tesouroBondType: null,
        tesouroMaturity: null,
      },
    },
  };

  const entry = () => makeEntry({ action: 'transacao.excluir', snapshot: snapshot as never });

  it('recria Portfolio + FixedIncomeAsset + transação com id original e recalcula', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null); // recalc deletou a posição
    mockPrisma.portfolio.create.mockResolvedValue({ id: 'port-1' });
    mockPrisma.fixedIncomeAsset.findUnique.mockResolvedValue(null);

    await CARTEIRA_UNDO_HANDLERS['transacao.excluir'].execute({ request, auth, entry: entry() });

    expect(mockPrisma.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'port-1', assetId: 'asset-1', quantity: 0 }),
    });
    expect(mockPrisma.fixedIncomeAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'asset-1', type: 'CDB', investedAmount: 1000 }),
    });
    expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'tx-1', quantity: 100, date: new Date('2026-06-01') }),
    });
    expect(mockRecalc).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolioId: 'port-1',
        recomputeSnapshotsFrom: new Date('2026-06-01'),
      }),
    );
    expect(mockSyncSonho).toHaveBeenCalled();
  });

  it('409 quando o asset não existe mais', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['transacao.excluir'].execute({ request, auth, entry: entry() }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('409 quando a transação já foi restaurada (P2002)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    mockPrisma.fixedIncomeAsset.findUnique.mockResolvedValue({ id: 'fi-1' });
    mockPrisma.stockTransaction.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      CARTEIRA_UNDO_HANDLERS['transacao.excluir'].execute({ request, auth, entry: entry() }),
    ).rejects.toMatchObject({ status: 409, message: 'A transação já foi restaurada' });
  });

  it('vínculo com sonho excluído degrada pra null (não cria órfã)', async () => {
    const snapWithSonho = {
      ...snapshot,
      meta: {
        portfolio: {
          id: 'port-1',
          assetId: 'asset-1',
          planejamentoObjetivoId: 'sonho-apagado',
        },
      },
    };
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.portfolio.create.mockResolvedValue({ id: 'port-1' });
    mockPrisma.planejamentoObjetivo.findUnique.mockResolvedValue(null);

    await CARTEIRA_UNDO_HANDLERS['transacao.excluir'].execute({
      request,
      auth,
      entry: makeEntry({ action: 'transacao.excluir', snapshot: snapWithSonho as never }),
    });

    expect(mockPrisma.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planejamentoObjetivoId: null }),
    });
  });
});

describe('ativo.remover (recreate-from-snapshot)', () => {
  const snapshot = {
    v: 1,
    kind: 'ativo-completo',
    data: {
      portfolio: { id: 'port-1', assetId: 'asset-1', objetivo: 10 },
      transactions: [
        {
          id: 'tx-1',
          assetId: 'asset-1',
          type: 'compra',
          quantity: 100,
          price: 10,
          total: 1000,
          date: '2026-05-01T00:00:00.000Z',
          fees: null,
          notes: null,
        },
        {
          id: 'tx-2',
          assetId: 'asset-1',
          type: 'venda',
          quantity: 50,
          price: 12,
          total: 600,
          date: '2026-06-01T00:00:00.000Z',
          fees: null,
          notes: null,
        },
      ],
    },
  };
  const entry = () =>
    makeEntry({ action: 'ativo.remover', entityId: 'port-1', snapshot: snapshot as never });

  it('recria posição + transações e invalida snapshots da 1ª data', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.portfolio.create.mockResolvedValue({ id: 'port-1' });

    await CARTEIRA_UNDO_HANDLERS['ativo.remover'].execute({ request, auth, entry: entry() });

    expect(mockPrisma.stockTransaction.create).toHaveBeenCalledTimes(2);
    expect(mockInvalidateSnapshots).toHaveBeenCalledWith(
      'user-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );
    expect(mockRecalc).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'asset-1', portfolioId: 'port-1' }),
    );
  });

  it('409 quando o ativo já voltou pra carteira (unique userId+assetId)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-other' });

    await expect(
      CARTEIRA_UNDO_HANDLERS['ativo.remover'].execute({ request, auth, entry: entry() }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.portfolio.create).not.toHaveBeenCalled();
  });
});

describe('proventos', () => {
  it('provento.adicionar → delete-created', async () => {
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue({ id: 'prov-1' });
    await CARTEIRA_UNDO_HANDLERS['provento.adicionar'].execute({
      request,
      auth,
      entry: makeEntry({ action: 'provento.adicionar', entityId: 'prov-1' }),
    });
    expect(mockPrisma.portfolioProvento.delete).toHaveBeenCalledWith({ where: { id: 'prov-1' } });
  });

  it('provento.excluir → un-dismiss (não requer snapshot)', async () => {
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue({ id: 'prov-1', dismissed: true });
    await CARTEIRA_UNDO_HANDLERS['provento.excluir'].execute({
      request,
      auth,
      entry: makeEntry({ action: 'provento.excluir', entityId: 'prov-1' }),
    });
    expect(mockPrisma.portfolioProvento.update).toHaveBeenCalledWith({
      where: { id: 'prov-1' },
      data: { dismissed: false },
    });
  });

  it('provento.excluir → 409 se já restaurado', async () => {
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue({ id: 'prov-1', dismissed: false });
    await expect(
      CARTEIRA_UNDO_HANDLERS['provento.excluir'].execute({
        request,
        auth,
        entry: makeEntry({ action: 'provento.excluir', entityId: 'prov-1' }),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('métricas do DashboardData (caixa-investir / resumo)', () => {
  const entryWith = (value: number | null, after = 500) =>
    makeEntry({
      action: 'caixa-investir.atualizar',
      entityId: 'caixa_para_investir_acoes',
      changes: [{ field: 'value', label: 'Caixa para investir', before: value, after }] as never,
      snapshot: {
        v: 1,
        kind: 'dashboard-metric',
        data: { value },
        meta: { metric: 'caixa_para_investir_acoes' },
      } as never,
    });

  it('restaura o valor anterior da métrica', async () => {
    mockPrisma.dashboardData.findFirst.mockResolvedValue({ id: 'dd-1', value: 500 });
    await CARTEIRA_UNDO_HANDLERS['caixa-investir.atualizar'].execute({
      request,
      auth,
      entry: entryWith(200),
    });
    expect(mockPrisma.dashboardData.update).toHaveBeenCalledWith({
      where: { id: 'dd-1' },
      data: { value: 200 },
    });
  });

  it('métrica que não existia antes → delete da row', async () => {
    mockPrisma.dashboardData.findFirst.mockResolvedValue({ id: 'dd-1', value: 500 });
    await CARTEIRA_UNDO_HANDLERS['caixa-investir.atualizar'].execute({
      request,
      auth,
      entry: entryWith(null),
    });
    expect(mockPrisma.dashboardData.delete).toHaveBeenCalledWith({ where: { id: 'dd-1' } });
  });

  it('409 quando o valor atual não bate com o after', async () => {
    mockPrisma.dashboardData.findFirst.mockResolvedValue({ id: 'dd-1', value: 777 });
    await expect(
      CARTEIRA_UNDO_HANDLERS['caixa-investir.atualizar'].execute({
        request,
        auth,
        entry: entryWith(200),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('objetivo-classe.definir (restore-fields)', () => {
  it('restaura o objetivo anterior do Portfolio', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1', objetivo: 25 });
    await CARTEIRA_UNDO_HANDLERS['objetivo-classe.definir'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'objetivo-classe.definir',
        entityId: 'port-1',
        changes: [
          { field: 'objetivo', label: 'Objetivo', before: 10, after: 25, format: 'percent' },
        ] as never,
      }),
    });
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: 'port-1' },
      data: { objetivo: 10 },
    });
  });
});
