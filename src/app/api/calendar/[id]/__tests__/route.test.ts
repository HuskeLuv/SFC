import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: { event: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() } },
  requireAuthWithActing: vi.fn(),
  recordChange: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...orig, recordChange: mocks.recordChange };
});

import { PATCH, DELETE } from '../route';

const user = {
  payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
  targetUserId: 'user-1',
  actingClient: null,
};
const ctx = { params: Promise.resolve({ id: 'evt-1' }) };
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/calendar/evt-1', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const row = {
  id: 'evt-1',
  userId: 'user-1',
  title: 'Renovar seguro',
  description: null,
  date: new Date('2026-09-25T00:00:00.000Z'),
  endDate: null,
  hora: null,
  categoria: 'pessoal',
  recorrencia: 'nenhuma',
  lembrete: false,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthWithActing.mockResolvedValue(user);
  mocks.prisma.event.findFirst.mockResolvedValue(row);
});

describe('PATCH /api/calendar/[id]', () => {
  it('altera só os campos enviados e registra o diff (evento.editar)', async () => {
    mocks.prisma.event.update.mockResolvedValue({
      ...row,
      date: new Date('2026-10-01T00:00:00.000Z'),
      hora: '09:00',
      recorrencia: 'mensal',
    });
    const res = await PATCH(
      req('PATCH', { data: '2026-10-01', hora: '09:00', recorrencia: 'mensal' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).evento).toMatchObject({
      data: '2026-10-01',
      hora: '09:00',
      recorrencia: 'mensal',
    });
    expect(mocks.prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { date: new Date('2026-10-01T00:00:00.000Z'), hora: '09:00', recorrencia: 'mensal' },
    });
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'calendario',
        action: 'evento.editar',
        entityId: 'evt-1',
        changes: expect.arrayContaining([
          expect.objectContaining({ field: 'data', before: '2026-09-25', after: '2026-10-01' }),
          expect.objectContaining({ field: 'hora', before: null, after: '09:00' }),
          expect.objectContaining({ field: 'recorrencia', before: 'nenhuma', after: 'mensal' }),
        ]),
      }),
    );
  });

  it('edição sem mudança não gera histórico; fim antes do início (combinando com o atual) → 400', async () => {
    mocks.prisma.event.update.mockResolvedValue(row);
    await PATCH(req('PATCH', { titulo: 'Renovar seguro' }), ctx);
    expect(mocks.recordChange).not.toHaveBeenCalled();
    expect((await PATCH(req('PATCH', { dataFim: '2026-09-20' }), ctx)).status).toBe(400);
    expect((await PATCH(req('PATCH', {}), ctx)).status).toBe(400);
  });

  it('evento de outro usuário → 404; consultor → 403', async () => {
    mocks.prisma.event.findFirst.mockResolvedValue(null);
    expect((await PATCH(req('PATCH', { titulo: 'x' }), ctx)).status).toBe(404);
    mocks.requireAuthWithActing.mockResolvedValue({
      ...user,
      targetUserId: 'c1',
      actingClient: { id: 'c1' },
    });
    expect((await PATCH(req('PATCH', { titulo: 'x' }), ctx)).status).toBe(403);
    expect(mocks.prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/calendar/[id]', () => {
  it('exclui e guarda snapshot completo para desfazer', async () => {
    const res = await DELETE(req('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(mocks.prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'evento.excluir',
        entityLabel: 'Renovar seguro',
        snapshot: {
          v: 1,
          kind: 'evento',
          data: {
            id: 'evt-1',
            titulo: 'Renovar seguro',
            descricao: null,
            data: '2026-09-25',
            dataFim: null,
            hora: null,
            categoria: 'pessoal',
            recorrencia: 'nenhuma',
            lembrete: false,
          },
        },
      }),
    );
  });

  it('consultor não exclui (403)', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      ...user,
      targetUserId: 'c1',
      actingClient: { id: 'c1' },
    });
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(403);
    expect(mocks.prisma.event.delete).not.toHaveBeenCalled();
  });
});
