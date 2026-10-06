import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn() },
  watchlist: { findFirst: vi.fn(), update: vi.fn() },
  bankInvestment: { updateMany: vi.fn() },
  userChangeLog: { findFirst: vi.fn(), findMany: vi.fn() },
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
import { ACAO_DESTINO_IMPORTACAO } from '@/lib/pluggyDestinos';
import { MOVER_ACTIONS_LIST } from '@/lib/carteiraMover';
import { movidoInfoPorEntidade } from '@/services/portfolio/movidoInfo';
import { renderDescription } from '@/components/historicoAlteracoes/renderChange';
import type { UndoContext } from '../types';

const auth = { payload: { id: 'user-1' }, targetUserId: 'user-1', actingClient: null };
const request = new NextRequest('http://localhost/api/historico-alteracoes/log-1/undo', {
  method: 'POST',
});

// KNCA11 importado em FII's › Tijolo (estratégia padrão); escolhido Fundos › Fiagro.
const antes = {
  categoriaOverride: null,
  estrategia: null,
  tipoFii: 'tijolo',
  regiaoEtf: null,
  tipoFundo: null,
  objetivo: 0,
};
const depois = { ...antes, categoriaOverride: 'fimFia', tipoFundo: 'fiagro' };

const makeEntry = (overrides: Partial<UserChangeLog> = {}): UserChangeLog =>
  ({
    id: 'log-1',
    userId: 'user-1',
    actorId: 'user-1',
    viaConsultant: false,
    section: 'carteira',
    action: ACAO_DESTINO_IMPORTACAO,
    entity: 'portfolio',
    entityId: 'p-1',
    entityLabel: 'KNCA11',
    changes: [
      { field: 'aba', label: 'Aba', before: "FII's", after: 'Fundos' },
      { field: 'subgrupo', label: 'Subgrupo', before: 'Tijolo', after: 'Fiagro' },
    ],
    snapshot: { v: 1, kind: 'mover', data: antes, meta: { after: depois } },
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-10-06T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const ctx = (entry: UserChangeLog): UndoContext =>
  ({ auth, request, entry }) as unknown as UndoContext;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registry — investimento.destinoImportacao', () => {
  it('desfazível (custom, exige entityId + snapshot), com handler próprio', () => {
    const def = UNDO_REGISTRY[ACAO_DESTINO_IMPORTACAO];
    expect(def).toBeDefined();
    expect(def.strategy).toBe('custom');
    expect(def.requires).toEqual({ entityId: true, snapshot: true });
    expect(def).not.toBe(UNDO_REGISTRY['investimento.mover']);
  });

  it('os handlers do mover continuam os mesmos (um só, compartilhado)', () => {
    const defs = new Set(MOVER_ACTIONS_LIST.map((a) => CARTEIRA_UNDO_HANDLERS[a]));
    expect(defs.size).toBe(1);
  });

  it('LIFO: um Mover depois da escolha bloqueia o desfazer (409)', async () => {
    mockPrisma.userChangeLog.findFirst.mockResolvedValue({ id: 'log-2' });
    await expect(assertUndoable(makeEntry(), 'user-1')).rejects.toMatchObject({ status: 409 });
  });
});

describe('investimento.destinoImportacao — desfazer', () => {
  const def = CARTEIRA_UNDO_HANDLERS[ACAO_DESTINO_IMPORTACAO];

  it('volta à sugestão (override/tipoFundo de antes) e devolve o item à fila', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({ id: 'p-1', ...depois });
    mockPrisma.bankInvestment.updateMany.mockResolvedValue({ count: 1 });
    const outcome = await def.execute(ctx(makeEntry()));

    const { where, data } = mockPrisma.portfolio.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'p-1' });
    expect(data).toMatchObject({ categoriaOverride: null, tipoFii: 'tijolo', tipoFundo: null });
    expect(mockPrisma.bankInvestment.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', portfolioId: 'p-1', importStatus: 'importado' },
      data: { destinoConfirmadoEm: null },
    });
    expect(outcome.changes).toEqual([
      { field: 'aba', label: 'Aba', before: 'Fundos', after: "FII's" },
      { field: 'subgrupo', label: 'Subgrupo', before: 'Fiagro', after: 'Tijolo' },
    ]);
    expect(mockInvalidateCaixa).toHaveBeenCalledWith('user-1');
    expect(mockInvalidarContexto).toHaveBeenCalledWith('user-1');
  });

  it('linha movida depois → 409 MSG_MOVIDO_DE_NOVO sem zerar a coluna', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'p-1',
      ...depois,
      tipoFundo: 'multimercado',
    });
    await expect(def.execute(ctx(makeEntry()))).rejects.toMatchObject({
      status: 409,
      message: MSG_MOVIDO_DE_NOVO,
    });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    expect(mockPrisma.bankInvestment.updateMany).not.toHaveBeenCalled();
  });

  it('posição apagada → 409 sem zerar a coluna', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    await expect(def.execute(ctx(makeEntry()))).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.bankInvestment.updateMany).not.toHaveBeenCalled();
  });

  it('posse: busca a posição só do targetUserId', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    await expect(def.execute(ctx(makeEntry()))).rejects.toBeDefined();
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', userId: 'user-1' },
    });
  });
});

describe('sem selo "movido" e rótulo no Histórico', () => {
  it('a action fica fora de MOVER_ACTIONS_LIST e fora da consulta do selo', async () => {
    expect(MOVER_ACTIONS_LIST).not.toContain(ACAO_DESTINO_IMPORTACAO);
    mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
    const selos = await movidoInfoPorEntidade('user-1', ['p-1']);
    expect(selos.size).toBe(0);
    const { where } = mockPrisma.userChangeLog.findMany.mock.calls[0][0];
    expect(where.action.in).not.toContain(ACAO_DESTINO_IMPORTACAO);
  });

  it('renderChange: "Escolheu onde fica <ativo>, importado do banco"', () => {
    const base = { section: 'carteira', action: ACAO_DESTINO_IMPORTACAO };
    expect(renderDescription({ ...base, entityLabel: 'KNCA11' } as never)).toBe(
      'Escolheu onde fica KNCA11, importado do banco',
    );
    expect(renderDescription({ ...base, entityLabel: null } as never)).toBe(
      'Escolheu onde fica um investimento do banco',
    );
  });
});
