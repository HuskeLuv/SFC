import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
  portfolio: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  asset: { findUnique: vi.fn() },
  // Banco emissor no FI recriado (ClickUp 86e2xqh69).
  fixedIncomeAsset: { findFirst: vi.fn(), create: vi.fn() },
  institution: { findUnique: vi.fn() },
  planejamentoObjetivo: { findUnique: vi.fn() },
  watchlist: { create: vi.fn() },
  cashflowItem: { findFirst: vi.fn(), delete: vi.fn() },
  cashflowValue: { deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
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

const mockReverterCaixa = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/caixaParaInvestir', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portfolio/caixaParaInvestir')>()),
  reverterMovimentoCaixa: mockReverterCaixa,
}));

import { CARTEIRA_UNDO_HANDLERS } from '../handlers/carteira';
import { buildAtivoSnapshot, buildTransacaoSnapshot } from '../../snapshots';
import { UndoError } from '../types';
import type { UndoContext } from '../types';

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
    action: 'operacao.registrar',
    entity: 'operacao',
    entityId: 'tx-1',
    entityLabel: 'PETR4',
    changes: [],
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-08-14T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const ctx = (entry: UserChangeLog): UndoContext =>
  ({ auth, request, entry }) as unknown as UndoContext;

const TX_DATE = new Date('2026-08-01T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('operacao/aporte/resgate.registrar (delete-created composto)', () => {
  const acoes = ['operacao.registrar', 'aporte.registrar', 'resgate.registrar'] as const;

  it('as três ações compartilham o mesmo handler e estão registradas', () => {
    for (const acao of acoes) {
      expect(CARTEIRA_UNDO_HANDLERS[acao], acao).toBeDefined();
      expect(CARTEIRA_UNDO_HANDLERS[acao].strategy).toBe('delete-created');
    }
  });

  it('apaga a transação criada e recalcula com cutoff na DATA da transação', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: 'asset-1',
      date: TX_DATE,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1', assetId: 'asset-1' });

    await CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({})));

    expect(mockPrisma.stockTransaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
    expect(mockRecalc).toHaveBeenCalledWith({
      targetUserId: 'user-1',
      assetId: 'asset-1',
      portfolioId: 'port-1',
      recomputeSnapshotsFrom: TX_DATE,
    });
    expect(mockSyncSonho).toHaveBeenCalledWith('user-1', { assetId: 'asset-1' });
  });

  it('posição já encerrada (sem Portfolio): recalc resolve pela unique, sem portfolioId', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: 'asset-1',
      date: TX_DATE,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);

    await CARTEIRA_UNDO_HANDLERS['resgate.registrar'].execute(
      ctx(makeEntry({ action: 'resgate.registrar' })),
    );

    expect(mockRecalc).toHaveBeenCalledWith({
      targetUserId: 'user-1',
      assetId: 'asset-1',
      recomputeSnapshotsFrom: TX_DATE,
    });
  });

  it('transação sem assetId: só invalida snapshots', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: null,
      date: TX_DATE,
    });

    await CARTEIRA_UNDO_HANDLERS['aporte.registrar'].execute(
      ctx(makeEntry({ action: 'aporte.registrar' })),
    );

    expect(mockRecalc).not.toHaveBeenCalled();
    expect(mockInvalidateSnapshots).toHaveBeenCalledWith('user-1', TX_DATE);
    expect(mockSyncSonho).not.toHaveBeenCalled();
  });

  it('409 quando a transação criada não existe mais (já excluída por outro caminho)', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({}))),
    ).rejects.toThrow(UndoError);
    expect(mockPrisma.stockTransaction.delete).not.toHaveBeenCalled();
  });

  it('não desfaz transação de OUTRO user (escopo por userId no lookup)', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({}))),
    ).rejects.toThrow('A transação não existe mais');
    expect(mockPrisma.stockTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx-1', userId: 'user-1' },
    });
  });

  describe('Caixa para Investir', () => {
    const movimento = {
      aba: 'rendaFixa',
      valorOperacao: 5000,
      debitoReserva: 3000,
      debitoLivre: 2000,
      credito: 0,
      deltaTotal: -5000,
    };

    beforeEach(() => {
      mockPrisma.stockTransaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        assetId: 'asset-1',
        date: TX_DATE,
      });
      mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1' });
    });

    it('operação que mexeu no caixa: desfazer devolve o movimento', async () => {
      const entry = makeEntry({
        action: 'aporte.registrar',
        snapshot: { v: 1, kind: 'caixa-movimento', data: movimento },
      });
      await CARTEIRA_UNDO_HANDLERS['aporte.registrar'].execute(ctx(entry));
      expect(mockReverterCaixa).toHaveBeenCalledWith('user-1', movimento);
    });

    it('operação sem movimento de caixa (entradas antigas): não mexe no caixa', async () => {
      await CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({})));
      await CARTEIRA_UNDO_HANDLERS['resgate.registrar'].execute(
        ctx(
          makeEntry({
            action: 'resgate.registrar',
            snapshot: {
              v: 1,
              kind: 'caixa-movimento',
              data: { ...movimento, debitoReserva: 0, debitoLivre: 0, deltaTotal: 0 },
            },
          }),
        ),
      );
      expect(mockReverterCaixa).not.toHaveBeenCalled();
    });
  });
});

describe('resgate.registrar de item movido de aba e vendido por inteiro', () => {
  it('a posição recriada volta para a aba gravada na venda', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: 'asset-1',
      type: 'venda',
      date: TX_DATE,
      notes: JSON.stringify({ operation: { action: 'resgate', categoriaOverride: 'acoes' } }),
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    await CARTEIRA_UNDO_HANDLERS['resgate.registrar'].execute(
      ctx(makeEntry({ action: 'resgate.registrar' })),
    );
    expect(mockRecalc).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'asset-1' }));
    expect(mockPrisma.portfolio.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', assetId: 'asset-1' },
      data: { categoriaOverride: 'acoes' },
    });
  });

  it('venda sem aba gravada não mexe no override', async () => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: 'asset-1',
      type: 'venda',
      date: TX_DATE,
      notes: null,
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    await CARTEIRA_UNDO_HANDLERS['resgate.registrar'].execute(
      ctx(makeEntry({ action: 'resgate.registrar' })),
    );
    expect(mockPrisma.portfolio.updateMany).not.toHaveBeenCalled();
  });
});

describe('investimento.registrar (delete-created de item+valores do cashflow)', () => {
  const entry = () =>
    makeEntry({ action: 'investimento.registrar', entity: 'investimento', entityId: 'item-1' });

  it('apaga valores + item e invalida snapshots do mês mais antigo', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-1',
      objetivoId: null,
      dividaId: null,
      values: [
        { year: 2026, month: 7 },
        { year: 2026, month: 5 },
      ],
    });

    await CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry()));

    expect(mockPrisma.cashflowValue.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1' },
    });
    expect(mockPrisma.cashflowItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    expect(mockInvalidateSnapshots).toHaveBeenCalledWith('user-1', new Date(2026, 5, 1));
  });

  it('409 para linha-espelho de sonho ou de dívida', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-1',
      objetivoId: 'sonho-1',
      dividaId: null,
      values: [],
    });
    await expect(
      CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry())),
    ).rejects.toThrow('espelha um sonho');

    mockPrisma.cashflowItem.findFirst.mockResolvedValue({
      id: 'item-1',
      objetivoId: null,
      dividaId: 'div-1',
      values: [],
    });
    await expect(
      CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry())),
    ).rejects.toThrow('espelha uma dívida');
  });

  it('409 quando o item não existe mais', async () => {
    mockPrisma.cashflowItem.findFirst.mockResolvedValue(null);
    await expect(
      CARTEIRA_UNDO_HANDLERS['investimento.registrar'].execute(ctx(entry())),
    ).rejects.toThrow('O investimento não existe mais');
  });
});

describe('operacao.registrar que ABSORVEU um planejado', () => {
  const planejado = {
    id: 'plan-1',
    assetId: 'asset-1',
    objetivo: 30,
    secao: 'growth',
    categoriaOverride: 'fimFia',
    notes: 'comprar na baixa',
    addedAt: '2026-07-01T10:00:00.000Z',
  };
  const recriado = {
    data: {
      id: 'plan-1',
      userId: 'user-1',
      assetId: 'asset-1',
      objetivo: 30,
      secao: 'growth',
      categoriaOverride: 'fimFia',
      notes: 'comprar na baixa',
      addedAt: new Date('2026-07-01T10:00:00.000Z'),
    },
  };

  beforeEach(() => {
    mockPrisma.stockTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      assetId: 'asset-1',
      date: TX_DATE,
    });
  });

  it('sem posição restante: recria o planejado com o MESMO id, objetivo, seção e aba', async () => {
    // antes do delete: a posição criada pela compra; depois do recalc: sumiu
    mockPrisma.portfolio.findFirst
      .mockResolvedValueOnce({ id: 'port-1', assetId: 'asset-1' })
      .mockResolvedValueOnce(null);
    await CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(
      ctx(makeEntry({ snapshot: { v: 1, kind: 'planejado', data: planejado } })),
    );
    expect(mockPrisma.stockTransaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
    expect(mockRecalc).toHaveBeenCalled();
    expect(mockPrisma.watchlist.create).toHaveBeenCalledWith(recriado);
    expect(mockReverterCaixa).not.toHaveBeenCalled();
  });

  it('compra que também mexeu no caixa: planejado vem em meta e o caixa é devolvido', async () => {
    const movimento = {
      aba: 'acoes',
      valorOperacao: 1000,
      debitoReserva: 0,
      debitoLivre: 1000,
      credito: 0,
      deltaTotal: -1000,
    };
    mockPrisma.portfolio.findFirst
      .mockResolvedValueOnce({ id: 'port-1', assetId: 'asset-1' })
      .mockResolvedValueOnce(null);
    await CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(
      ctx(
        makeEntry({
          snapshot: {
            v: 1,
            kind: 'caixa-movimento',
            data: movimento,
            meta: { planejadoAbsorvido: planejado },
          },
        }),
      ),
    );
    expect(mockPrisma.watchlist.create).toHaveBeenCalledWith(recriado);
    expect(mockReverterCaixa).toHaveBeenCalledWith('user-1', movimento);
  });

  it('ainda há posição (outras compras do ativo): não recria e o desfazer não falha', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'port-1', assetId: 'asset-1' });
    await CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(
      ctx(makeEntry({ snapshot: { v: 1, kind: 'planejado', data: planejado } })),
    );
    expect(mockPrisma.stockTransaction.delete).toHaveBeenCalled();
    expect(mockPrisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('ativo já planejado de novo (unique): ignora e conclui o desfazer', async () => {
    mockPrisma.portfolio.findFirst
      .mockResolvedValueOnce({ id: 'port-1', assetId: 'asset-1' })
      .mockResolvedValueOnce(null);
    mockPrisma.watchlist.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(
      CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(
        ctx(makeEntry({ snapshot: { v: 1, kind: 'planejado', data: planejado } })),
      ),
    ).resolves.toBeDefined();
    expect(mockSyncSonho).toHaveBeenCalledWith('user-1', { assetId: 'asset-1' });
  });

  it('entrada antiga (sem snapshot do planejado): comportamento de sempre', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValueOnce({ id: 'port-1' }).mockResolvedValue(null);
    await CARTEIRA_UNDO_HANDLERS['operacao.registrar'].execute(ctx(makeEntry({})));
    expect(mockPrisma.watchlist.create).not.toHaveBeenCalled();
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('Desfazer exclusão mantém o banco emissor da renda fixa (86e2xqh69)', () => {
  const fiRow = {
    type: 'CDB_PRE',
    description: 'CDB Banco XP 2028',
    startDate: new Date('2026-01-10T00:00:00Z'),
    maturityDate: new Date('2028-01-10T00:00:00Z'),
    investedAmount: 10000,
    annualRate: 14.35,
    indexer: 'PRE',
    indexerPercent: null,
    liquidityType: null,
    taxExempt: false,
    tesouroBondType: null,
    tesouroMaturity: null,
    emissorInstitutionId: 'inst-bxp',
  };
  const portfolioMeta = {
    id: 'port-rf',
    assetId: 'asset-rf',
    objetivo: 0,
    estrategia: null,
    tipoFii: null,
    regiaoEtf: null,
    planejamentoObjetivoId: null,
    vinculoAposentadoria: false,
  };
  const txRow = {
    id: 'tx-rf',
    assetId: 'asset-rf',
    type: 'compra',
    quantity: 1,
    price: 10000,
    total: 10000,
    date: new Date('2026-01-10T00:00:00Z'),
    fees: 0,
    notes: JSON.stringify({ operation: { instituicaoId: 'inst-btg' } }),
  };

  beforeEach(() => {
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-rf' });
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
    mockPrisma.portfolio.create.mockResolvedValue({ id: 'port-rf' });
  });

  it('o snapshot da transação leva o emissor', () => {
    const snap = buildTransacaoSnapshot(txRow, { portfolio: portfolioMeta, fixedIncome: fiRow });
    expect((snap.meta?.fixedIncome as { emissorInstitutionId: string }).emissorInstitutionId).toBe(
      'inst-bxp',
    );
  });

  it('transacao.excluir: o FI recriado mantém o emissor', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-bxp' });
    const snapshot = buildTransacaoSnapshot(txRow, {
      portfolio: portfolioMeta,
      fixedIncome: fiRow,
    });
    await CARTEIRA_UNDO_HANDLERS['transacao.excluir'].execute(
      ctx(makeEntry({ action: 'transacao.excluir', entityId: 'tx-rf', snapshot })),
    );
    expect(mockPrisma.fixedIncomeAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'CDB_PRE', emissorInstitutionId: 'inst-bxp' }),
    });
  });

  it('ativo.remover: emissor apagado do catálogo vira null (fallback corretora)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.institution.findUnique.mockResolvedValue(null);
    const snapshot = buildAtivoSnapshot(portfolioMeta, [txRow], fiRow)!;
    await CARTEIRA_UNDO_HANDLERS['ativo.remover'].execute(
      ctx(makeEntry({ action: 'ativo.remover', entityId: 'port-rf', snapshot })),
    );
    expect(mockPrisma.fixedIncomeAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ emissorInstitutionId: null }),
    });
  });

  it('snapshot antigo (sem emissor) recria o FI sem emissor, sem consultar o catálogo', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    const { emissorInstitutionId: _semEmissor, ...fiAntigo } = fiRow;
    const snapshot = buildAtivoSnapshot(portfolioMeta, [txRow], fiAntigo)!;
    await CARTEIRA_UNDO_HANDLERS['ativo.remover'].execute(
      ctx(makeEntry({ action: 'ativo.remover', entityId: 'port-rf', snapshot })),
    );
    expect(mockPrisma.institution.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.fixedIncomeAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ emissorInstitutionId: null }),
    });
  });
});
