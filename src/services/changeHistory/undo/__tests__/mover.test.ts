import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  watchlist: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  asset: { findUnique: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn(), create: vi.fn() },
  stockTransaction: { create: vi.fn() },
  planejamentoObjetivo: { findUnique: vi.fn() },
  userChangeLog: { findFirst: vi.fn() },
}));
const mockInvalidarContexto = vi.hoisted(() => vi.fn());
const mockInvalidateCaixa = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: vi.fn(),
  invalidatePortfolioSnapshots: vi.fn(),
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: vi.fn(),
}));
vi.mock('@/services/assistente/contexto', () => ({
  invalidarContextoUsuario: mockInvalidarContexto,
}));
vi.mock('@/services/portfolio/caixaParaInvestir', () => ({
  invalidateCaixaCaches: mockInvalidateCaixa,
  movimentouCaixa: vi.fn(),
  reverterDistribuicaoCaixa: vi.fn(),
  reverterMovimentoCaixa: vi.fn(),
}));

import { CARTEIRA_UNDO_HANDLERS, MSG_MOVIDO_DE_NOVO } from '../handlers/carteira';
import { UNDO_REGISTRY } from '../registry';
import { assertUndoable } from '../execute';
import { buildAtivoSnapshot } from '../../snapshots';
import { buildPlanejadoSnapshot } from '../../planejadoHelpers';
import { MOVER_ACTIONS_LIST } from '@/lib/carteiraMover';
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
    action: 'investimento.mover',
    entity: 'portfolio',
    entityId: 'p-1',
    entityLabel: 'KDIF11',
    changes: null,
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const ctx = (entry: UserChangeLog): UndoContext =>
  ({ auth, request, entry }) as unknown as UndoContext;

const antesPosicao = {
  categoriaOverride: null,
  estrategia: null,
  tipoFii: 'tvm',
  regiaoEtf: null,
  tipoFundo: null,
  objetivo: 10,
};
const depoisPosicao = {
  ...antesPosicao,
  categoriaOverride: 'fimFia',
  tipoFundo: 'fiagro',
  objetivo: 0,
};
const changesPosicao = [
  { field: 'aba', label: 'Aba', before: "FII's", after: 'Fundos' },
  { field: 'subgrupo', label: 'Subgrupo', before: 'TVM', after: 'Fiagro' },
];
const entryMover = makeEntry({
  changes: changesPosicao as unknown as UserChangeLog['changes'],
  snapshot: { v: 1, kind: 'mover', data: antesPosicao, meta: { after: depoisPosicao } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registry do mover', () => {
  it('os 4 actions são desfazíveis (custom, exigem entityId + snapshot)', () => {
    for (const action of MOVER_ACTIONS_LIST) {
      expect(UNDO_REGISTRY[action]).toBeDefined();
      expect(UNDO_REGISTRY[action].strategy).toBe('custom');
      expect(UNDO_REGISTRY[action].requires).toEqual({ entityId: true, snapshot: true });
    }
  });

  it('assertUndoable: 409 quando houve outro mover depois (LIFO)', async () => {
    mockPrisma.userChangeLog.findFirst.mockResolvedValue({ id: 'log-2' });
    await expect(assertUndoable(entryMover, 'user-1')).rejects.toMatchObject({ status: 409 });
    mockPrisma.userChangeLog.findFirst.mockResolvedValue(null);
    await expect(assertUndoable(entryMover, 'user-1')).resolves.toBeDefined();
  });
});

describe('investimento.mover — desfazer', () => {
  const def = CARTEIRA_UNDO_HANDLERS['investimento.mover'];

  it('restaura exatamente o estado antes (override null, subgrupos e objetivo)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'p-1', ...depoisPosicao });
    const outcome = await def.execute(ctx(entryMover));
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', userId: 'user-1' },
    });
    const { data } = mockPrisma.portfolio.update.mock.calls[0][0];
    expect(data).toMatchObject(antesPosicao);
    expect(data.categoriaOverride).toBeNull();
    expect(data.lastUpdate).toBeInstanceOf(Date);
    expect(outcome.changes).toEqual([
      { field: 'aba', label: 'Aba', before: 'Fundos', after: "FII's" },
      { field: 'subgrupo', label: 'Subgrupo', before: 'Fiagro', after: 'TVM' },
    ]);
    expect(mockInvalidarContexto).toHaveBeenCalledWith('user-1');
    expect(mockInvalidateCaixa).toHaveBeenCalledWith('user-1');
  });

  it('409 quando a linha foi movida de novo (não bate com meta.after)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'p-1',
      ...depoisPosicao,
      categoriaOverride: 'acoes',
    });
    await expect(def.execute(ctx(entryMover))).rejects.toMatchObject({
      status: 409,
      message: MSG_MOVIDO_DE_NOVO,
    });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('409 quando a posição não existe mais', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    await expect(def.execute(ctx(entryMover))).rejects.toMatchObject({ status: 409 });
  });

  it('400 com snapshot de outro formato', async () => {
    await expect(
      def.execute(ctx(makeEntry({ snapshot: { v: 1, kind: 'planejado', data: {} } }))),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('restaurar e planejado — desfazer', () => {
  it('investimento.restaurar: volta ao override de antes', async () => {
    const def = CARTEIRA_UNDO_HANDLERS['investimento.restaurar'];
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'p-1', ...antesPosicao, objetivo: 0 });
    await def.execute(
      ctx(
        makeEntry({
          action: 'investimento.restaurar',
          snapshot: {
            v: 1,
            kind: 'mover',
            data: { ...depoisPosicao },
            meta: { after: { ...antesPosicao, objetivo: 0 } },
          },
        }),
      ),
    );
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: 'fimFia',
      tipoFundo: 'fiagro',
    });
  });

  it('planejado.mover: restaura override e secao; 409 se virou posição', async () => {
    const def = CARTEIRA_UNDO_HANDLERS['planejado.mover'];
    const entry = makeEntry({
      action: 'planejado.mover',
      entity: 'watchlist',
      entityId: 'w-1',
      snapshot: {
        v: 1,
        kind: 'mover',
        data: { categoriaOverride: null, secao: 'tvm' },
        meta: { after: { categoriaOverride: 'acoes', secao: 'growth' } },
      },
    });
    mockPrisma.watchlist.findFirst.mockResolvedValue({
      id: 'w-1',
      categoriaOverride: 'acoes',
      secao: 'growth',
      objetivo: 5,
    });
    await def.execute(ctx(entry));
    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { id: 'w-1' },
      data: { categoriaOverride: null, secao: 'tvm' },
    });

    mockPrisma.watchlist.findFirst.mockResolvedValue(null);
    await expect(def.execute(ctx(entry))).rejects.toMatchObject({ status: 409 });
  });
});

describe('fase 2 (Reservas + Renda Fixa) — desfazer sem lógica nova', () => {
  const antesRf = {
    categoriaOverride: null,
    estrategia: null,
    tipoFii: null,
    regiaoEtf: null,
    tipoFundo: null,
    objetivo: 5,
  };
  const depoisEmergencia = { ...antesRf, categoriaOverride: 'reservaEmergencia', objetivo: 0 };
  const entryRf = makeEntry({
    entityLabel: 'CDB Banco X',
    changes: [
      { field: 'aba', label: 'Aba', before: 'Renda Fixa', after: 'Reserva Emergência' },
      { field: 'subgrupo', label: 'Subgrupo', before: 'Pós-fixada', after: null },
    ] as unknown as UserChangeLog['changes'],
    snapshot: { v: 1, kind: 'mover', data: antesRf, meta: { after: depoisEmergencia } },
  });
  const def = CARTEIRA_UNDO_HANDLERS['investimento.mover'];

  it('CDB RF → Emergência: desfazer volta à RF com o objetivo de antes', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'p-1', ...depoisEmergencia });
    const outcome = await def.execute(ctx(entryRf));
    const { data } = mockPrisma.portfolio.update.mock.calls[0][0];
    expect(data).toMatchObject({ categoriaOverride: null, objetivo: 5 });
    expect(outcome.changes).toEqual([
      { field: 'aba', label: 'Aba', before: 'Reserva Emergência', after: 'Renda Fixa' },
      { field: 'subgrupo', label: 'Subgrupo', before: null, after: 'Pós-fixada' },
    ]);
    expect(mockInvalidateCaixa).toHaveBeenCalledWith('user-1');
  });

  it('2º desfazer da mesma entrada: 409 amigável e nada gravado', async () => {
    // A linha já voltou ao estado de antes: não bate com meta.after.
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'p-1', ...antesRf });
    await expect(def.execute(ctx(entryRf))).rejects.toMatchObject({
      status: 409,
      message: MSG_MOVIDO_DE_NOVO,
    });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
  });

  it('Emergência → Oportunidade desfeito volta à Emergência; LIFO bloqueia o mais antigo', async () => {
    const depoisOport = { ...depoisEmergencia, categoriaOverride: 'reservaOportunidade' };
    const entryOport = makeEntry({
      id: 'log-2',
      createdAt: new Date('2026-10-02T12:00:00Z'),
      changes: [
        { field: 'aba', label: 'Aba', before: 'Reserva Emergência', after: 'Reserva Oportunidade' },
      ] as unknown as UserChangeLog['changes'],
      snapshot: { v: 1, kind: 'mover', data: depoisEmergencia, meta: { after: depoisOport } },
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'p-1', ...depoisOport });
    await def.execute(ctx(entryOport));
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data.categoriaOverride).toBe(
      'reservaEmergencia',
    );

    mockPrisma.userChangeLog.findFirst.mockResolvedValue({ id: 'log-2' });
    await expect(assertUndoable(entryRf, 'user-1')).rejects.toMatchObject({ status: 409 });
  });

  it('investimento.restaurar de um Tesouro movido para a RF: desfazer devolve o override', async () => {
    const restaurar = CARTEIRA_UNDO_HANDLERS['investimento.restaurar'];
    const movido = { ...antesRf, categoriaOverride: 'rendaFixaFundos', objetivo: 0 };
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'p-1',
      ...movido,
      categoriaOverride: null,
    });
    await restaurar.execute(
      ctx(
        makeEntry({
          action: 'investimento.restaurar',
          snapshot: {
            v: 1,
            kind: 'mover',
            data: movido,
            meta: { after: { ...movido, categoriaOverride: null } },
          },
        }),
      ),
    );
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data.categoriaOverride).toBe(
      'rendaFixaFundos',
    );
  });
});

describe('snapshots carregam o override', () => {
  it('ativo.remover recria a posição com categoriaOverride e tipoFundo', async () => {
    const portfolio = {
      id: 'p-1',
      assetId: 'a-kdif',
      objetivo: 0,
      estrategia: null,
      tipoFii: 'tvm',
      regiaoEtf: null,
      categoriaOverride: 'fimFia',
      tipoFundo: 'fiagro',
      planejamentoObjetivoId: null,
      vinculoAposentadoria: false,
    };
    const snapshot = buildAtivoSnapshot(portfolio, []);
    expect(snapshot?.data.portfolio).toMatchObject({
      categoriaOverride: 'fimFia',
      tipoFundo: 'fiagro',
    });

    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a-kdif' });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.portfolio.create.mockResolvedValue({ id: 'p-1' });
    await CARTEIRA_UNDO_HANDLERS['ativo.remover'].execute(
      ctx(makeEntry({ action: 'ativo.remover', entity: 'ativo', snapshot })),
    );
    expect(mockPrisma.portfolio.create.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: 'fimFia',
      tipoFundo: 'fiagro',
    });
  });

  it('planejado.remover recria o planejado com o override', async () => {
    const snapshot = buildPlanejadoSnapshot({
      id: 'w-1',
      userId: 'user-1',
      assetId: 'a-kdif',
      addedAt: new Date('2026-09-16T00:00:00Z'),
      notes: null,
      objetivo: 5,
      secao: 'growth',
      categoriaOverride: 'acoes',
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.watchlist.create.mockResolvedValue({ id: 'w-1' });
    await CARTEIRA_UNDO_HANDLERS['planejado.remover'].execute(
      ctx(makeEntry({ action: 'planejado.remover', entity: 'planejado', snapshot })),
    );
    expect(mockPrisma.watchlist.create.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: 'acoes',
      secao: 'growth',
    });
  });
});
