import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  event: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { CALENDARIO_UNDO_HANDLERS } from '../handlers/calendario';

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
    section: 'calendario',
    action: 'evento.editar',
    entity: 'evento',
    entityId: 'evt-1',
    entityLabel: 'Renovar seguro',
    changes: null,
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-09-10T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const row = {
  id: 'evt-1',
  userId: 'user-1',
  title: 'Renovar seguro',
  description: null,
  date: new Date('2026-10-01T00:00:00.000Z'),
  endDate: null,
  hora: '09:00',
  categoria: 'pessoal',
  recorrencia: 'mensal',
  lembrete: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe('evento.criar', () => {
  it('apaga o evento criado; 409 se já não existe', async () => {
    mockPrisma.event.findFirst.mockResolvedValue(row);
    const out = await CALENDARIO_UNDO_HANDLERS['evento.criar'].execute({
      auth,
      request,
      entry: makeEntry({
        action: 'evento.criar',
        changes: [
          { field: 'titulo', label: 'Título', before: null, after: 'Renovar seguro' },
        ] as never,
      }),
    });
    expect(mockPrisma.event.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
    expect(out.changes).toEqual([
      { field: 'titulo', label: 'Título', before: 'Renovar seguro', after: null },
    ]);

    mockPrisma.event.findFirst.mockResolvedValue(null);
    await expect(
      CALENDARIO_UNDO_HANDLERS['evento.criar'].execute({
        auth,
        request,
        entry: makeEntry({ action: 'evento.criar' }),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('evento.editar', () => {
  const entry = () =>
    makeEntry({
      changes: [
        { field: 'data', label: 'Data', before: '2026-09-25', after: '2026-10-01' },
        { field: 'hora', label: 'Hora', before: null, after: '09:00' },
        { field: 'recorrencia', label: 'Repetição', before: 'nenhuma', after: 'mensal' },
      ] as never,
    });

  it('compara com o evento serializado (datas civis) e restaura via Prisma', async () => {
    mockPrisma.event.findFirst.mockResolvedValue(row);
    const out = await CALENDARIO_UNDO_HANDLERS['evento.editar'].execute({
      auth,
      request,
      entry: entry(),
    });
    expect(mockPrisma.event.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { date: new Date('2026-09-25T00:00:00.000Z'), hora: null, recorrencia: 'nenhuma' },
    });
    expect(out.changes?.[0]).toEqual({
      field: 'data',
      label: 'Data',
      before: '2026-10-01',
      after: '2026-09-25',
    });
  });

  it('409 quando o estado atual não bate com o after', async () => {
    mockPrisma.event.findFirst.mockResolvedValue({ ...row, hora: '10:00' });
    await expect(
      CALENDARIO_UNDO_HANDLERS['evento.editar'].execute({ auth, request, entry: entry() }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.event.update).not.toHaveBeenCalled();
  });
});

describe('evento.excluir', () => {
  const entry = () =>
    makeEntry({
      action: 'evento.excluir',
      snapshot: {
        v: 1,
        kind: 'evento',
        data: {
          id: 'evt-1',
          titulo: 'Renovar seguro',
          descricao: 'levar documentos',
          data: '2026-09-25',
          dataFim: '2026-09-26',
          hora: null,
          categoria: 'lembrete',
          recorrencia: 'anual',
          lembrete: true,
        },
      } as never,
    });

  it('recria com o id original a partir do snapshot', async () => {
    mockPrisma.event.create.mockResolvedValue(row);
    await CALENDARIO_UNDO_HANDLERS['evento.excluir'].execute({ auth, request, entry: entry() });
    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: {
        id: 'evt-1',
        userId: 'user-1',
        title: 'Renovar seguro',
        description: 'levar documentos',
        date: new Date('2026-09-25T00:00:00.000Z'),
        endDate: new Date('2026-09-26T00:00:00.000Z'),
        hora: null,
        categoria: 'lembrete',
        recorrencia: 'anual',
        lembrete: true,
      },
    });
  });

  it('409 se já restaurado (unique); 400 se o snapshot não é de evento', async () => {
    mockPrisma.event.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      CALENDARIO_UNDO_HANDLERS['evento.excluir'].execute({ auth, request, entry: entry() }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      CALENDARIO_UNDO_HANDLERS['evento.excluir'].execute({
        auth,
        request,
        entry: makeEntry({
          action: 'evento.excluir',
          snapshot: { v: 1, kind: 'divida', data: {} } as never,
        }),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
