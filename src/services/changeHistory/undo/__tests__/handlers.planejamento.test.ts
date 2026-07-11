import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  planejamentoObjetivo: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  planejamentoObjetivoEntry: {
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  aposentadoriaPlano: { findUnique: vi.fn(), update: vi.fn() },
  aposentadoriaPlanoEntry: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  portfolio: { updateMany: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

const mockSyncObjetivoToCashflow = vi.hoisted(() => vi.fn());
const mockSyncObjetivoRecord = vi.hoisted(() => vi.fn());
const mockRemoveObjetivoCashflow = vi.hoisted(() => vi.fn());
const mockSyncSonhoRealizado = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/planejamento/sonhoCashflowSync', () => ({
  syncObjetivoToCashflow: mockSyncObjetivoToCashflow,
  syncObjetivoRecordToCashflow: mockSyncObjetivoRecord,
  removeObjetivoCashflow: mockRemoveObjetivoCashflow,
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: mockSyncSonhoRealizado,
}));

import { PLANEJAMENTO_UNDO_HANDLERS } from '../handlers/planejamento';
import { PERFIL_UNDO_HANDLERS } from '../handlers/perfil';

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
    section: 'planejamento',
    action: 'sonho.editar',
    entity: 'sonho',
    entityId: 'sonho-1',
    entityLabel: 'Viagem',
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

describe('sonho.criar (delete-created)', () => {
  it('remove espelho no fluxo de caixa antes de deletar o sonho', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({ id: 'sonho-1' });
    await PLANEJAMENTO_UNDO_HANDLERS['sonho.criar'].execute({
      request,
      auth,
      entry: makeEntry({ action: 'sonho.criar' }),
    });
    expect(mockRemoveObjetivoCashflow).toHaveBeenCalledWith('sonho-1');
    expect(mockPrisma.planejamentoObjetivo.delete).toHaveBeenCalledWith({
      where: { id: 'sonho-1' },
    });
  });
});

describe('sonho.editar (restore-fields)', () => {
  it('restaura campos, re-deriva categoria e re-sincroniza a linha-espelho', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      id: 'sonho-1',
      months: 24,
      target: 5000,
    });
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue({
      id: 'sonho-1',
      name: 'Viagem',
      target: 5000,
      available: 0,
      months: 6,
      rate: 0,
      startDate: null,
      status: 'Iniciado',
    });

    await PLANEJAMENTO_UNDO_HANDLERS['sonho.editar'].execute({
      request,
      auth,
      entry: makeEntry({
        changes: [{ field: 'months', label: 'Prazo (meses)', before: 6, after: 24 }] as never,
      }),
    });

    expect(mockPrisma.planejamentoObjetivo.update).toHaveBeenCalledWith({
      where: { id: 'sonho-1' },
      data: { months: 6, category: 'c' },
    });
    expect(mockSyncObjetivoToCashflow).toHaveBeenCalled();
  });

  it('409 quando o estado atual difere do after', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({ id: 'sonho-1', months: 36 });
    await expect(
      PLANEJAMENTO_UNDO_HANDLERS['sonho.editar'].execute({
        request,
        auth,
        entry: makeEntry({
          changes: [{ field: 'months', label: 'Prazo (meses)', before: 6, after: 24 }] as never,
        }),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('sonho.excluir (recreate-from-snapshot)', () => {
  const snapshot = {
    v: 1,
    kind: 'sonho',
    data: {
      id: 'sonho-1',
      name: 'Viagem',
      target: 5000,
      months: 12,
      startDate: '2026-01',
      available: 100,
      rate: 0.005,
      priority: 'Alta',
      category: 'c',
      status: 'Iniciado',
      notes: null,
    },
    meta: {
      entries: [{ month: '2026-02', aporte: 100, balance: 200, source: 'manual' }],
      portfolioIds: ['port-1'],
    },
  };

  it('recria sonho + entries, re-linka ativos e re-sincroniza', async () => {
    mockPrisma.planejamentoObjetivo.create.mockResolvedValue({
      id: 'sonho-1',
      name: 'Viagem',
      target: 5000,
      available: 100,
      months: 12,
      rate: 0.005,
      startDate: '2026-01',
      status: 'Iniciado',
    });

    await PLANEJAMENTO_UNDO_HANDLERS['sonho.excluir'].execute({
      request,
      auth,
      entry: makeEntry({ action: 'sonho.excluir', snapshot: snapshot as never }),
    });

    expect(mockPrisma.planejamentoObjetivo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'sonho-1', name: 'Viagem' }),
    });
    expect(mockPrisma.planejamentoObjetivoEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ objetivoId: 'sonho-1', month: '2026-02' })],
    });
    expect(mockPrisma.portfolio.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ['port-1'] },
        planejamentoObjetivoId: null,
        vinculoAposentadoria: false,
      }),
      data: { planejamentoObjetivoId: 'sonho-1' },
    });
    expect(mockSyncObjetivoToCashflow).toHaveBeenCalled();
    expect(mockSyncSonhoRealizado).toHaveBeenCalledWith('user-1', { objetivoId: 'sonho-1' });
  });

  it('409 quando o sonho já foi restaurado (P2002)', async () => {
    mockPrisma.planejamentoObjetivo.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      PLANEJAMENTO_UNDO_HANDLERS['sonho.excluir'].execute({
        request,
        auth,
        entry: makeEntry({ action: 'sonho.excluir', snapshot: snapshot as never }),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('sonho-aporte.registrar (revert-upsert)', () => {
  const entryWith = (prevEntry: { aporte: number; balance: number; source: string } | null) =>
    makeEntry({
      action: 'sonho-aporte.registrar',
      changes: [
        { field: 'aporte', label: 'Aporte no mês', before: prevEntry?.aporte ?? null, after: 300 },
        {
          field: 'balance',
          label: 'Saldo ao fim do mês',
          before: prevEntry?.balance ?? null,
          after: 900,
        },
      ] as never,
      snapshot: {
        v: 1,
        kind: 'sonho-entry',
        data: { prevEntry },
        meta: { month: '2026-03', prevStatus: 'Em espera' },
      } as never,
    });

  it('sem entry anterior → deleta a entry criada e restaura o status', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      id: 'sonho-1',
      status: 'Iniciado',
    });
    mockPrisma.planejamentoObjetivoEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      aporte: 300,
      balance: 900,
    });
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue({ id: 'sonho-1' });

    await PLANEJAMENTO_UNDO_HANDLERS['sonho-aporte.registrar'].execute({
      request,
      auth,
      entry: entryWith(null),
    });

    expect(mockPrisma.planejamentoObjetivoEntry.delete).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
    });
    expect(mockPrisma.planejamentoObjetivo.update).toHaveBeenCalledWith({
      where: { id: 'sonho-1' },
      data: { status: 'Em espera' },
    });
    expect(mockSyncObjetivoRecord).toHaveBeenCalled();
  });

  it('com entry anterior → restaura aporte/balance/source', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      id: 'sonho-1',
      status: 'Em espera',
    });
    mockPrisma.planejamentoObjetivoEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      aporte: 300,
      balance: 900,
    });

    await PLANEJAMENTO_UNDO_HANDLERS['sonho-aporte.registrar'].execute({
      request,
      auth,
      entry: entryWith({ aporte: 100, balance: 500, source: 'auto' }),
    });

    expect(mockPrisma.planejamentoObjetivoEntry.upsert).toHaveBeenCalledWith({
      where: { objetivoId_month: { objetivoId: 'sonho-1', month: '2026-03' } },
      create: expect.objectContaining({ aporte: 100, balance: 500, source: 'auto' }),
      update: { aporte: 100, balance: 500, source: 'auto' },
    });
  });
});

describe('aposentadoria-aporte.registrar (revert-upsert)', () => {
  it('sem entry anterior → deleta a entry do offset', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue({ id: 'plano-1' });
    mockPrisma.aposentadoriaPlanoEntry.findUnique.mockResolvedValue({
      id: 'ape-1',
      aporteReal: 500,
      patFinal: 10000,
    });

    await PLANEJAMENTO_UNDO_HANDLERS['aposentadoria-aporte.registrar'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'aposentadoria-aporte.registrar',
        entityId: 'plano-1',
        changes: [
          { field: 'aporteReal', label: 'Aporte realizado', before: null, after: 500 },
          { field: 'patFinal', label: 'Patrimônio ao fim do mês', before: null, after: 10000 },
        ] as never,
        snapshot: {
          v: 1,
          kind: 'aposentadoria-entry',
          data: { prevEntry: null },
          meta: { off: 3 },
        } as never,
      }),
    });

    expect(mockPrisma.aposentadoriaPlanoEntry.delete).toHaveBeenCalledWith({
      where: { id: 'ape-1' },
    });
  });
});

describe('aposentadoria-aporte.excluir (recreate)', () => {
  it('recria a entry do snapshot', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue({ id: 'plano-1' });
    await PLANEJAMENTO_UNDO_HANDLERS['aposentadoria-aporte.excluir'].execute({
      request,
      auth,
      entry: makeEntry({
        action: 'aposentadoria-aporte.excluir',
        entityId: 'plano-1',
        snapshot: {
          v: 1,
          kind: 'aposentadoria-entry-excluir',
          data: { off: 3, year: 2026, month: 3, aporteReal: 500, patFinal: 10000 },
        } as never,
      }),
    });
    expect(mockPrisma.aposentadoriaPlanoEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planoId: 'plano-1', off: 3, aporteReal: 500 }),
    });
  });
});

describe('perfil.editar', () => {
  it('restaura apenas o nome', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Nome Novo' });
    await PERFIL_UNDO_HANDLERS['perfil.editar'].execute({
      request,
      auth,
      entry: makeEntry({
        section: 'perfil',
        action: 'perfil.editar',
        entityId: 'user-1',
        changes: [
          { field: 'name', label: 'Nome', before: 'Nome Antigo', after: 'Nome Novo' },
          { field: 'email', label: 'E-mail', before: 'a@a.com', after: 'b@b.com' },
        ] as never,
      }),
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Nome Antigo' },
    });
  });

  it('precheck rejeita diff só de e-mail', () => {
    const entry = makeEntry({
      section: 'perfil',
      action: 'perfil.editar',
      changes: [{ field: 'email', label: 'E-mail', before: 'a@a.com', after: 'b@b.com' }] as never,
    });
    expect(PERFIL_UNDO_HANDLERS['perfil.editar'].precheck!(entry)).toBe(false);
  });
});
