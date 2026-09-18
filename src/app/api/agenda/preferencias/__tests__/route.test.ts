import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  prisma: { agendaPreferencia: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { GET, PATCH } from '../route';

const user = {
  payload: { id: 'u1', email: 'a@b.c', role: 'user' },
  targetUserId: 'u1',
  actingClient: null,
};

const req = (body?: unknown) =>
  new NextRequest('http://localhost/api/agenda/preferencias', {
    method: body === undefined ? 'GET' : 'PATCH',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthWithActing.mockResolvedValue(user);
});

describe('GET /api/agenda/preferencias', () => {
  it('sem registro no banco vale o padrão (ligado, sem feed publicado)', async () => {
    mocks.prisma.agendaPreferencia.findUnique.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lembretes: true, icalToken: null, icalCriadoEm: null });
  });

  it('devolve o que está gravado, inclusive o token do feed', async () => {
    mocks.prisma.agendaPreferencia.findUnique.mockResolvedValue({
      lembretes: false,
      icalToken: 'tok-123',
      icalCriadoEm: new Date('2026-09-18T12:00:00Z'),
    });
    expect(await (await GET(req())).json()).toEqual({
      lembretes: false,
      icalToken: 'tok-123',
      icalCriadoEm: '2026-09-18T12:00:00.000Z',
    });
  });
});

describe('PATCH /api/agenda/preferencias', () => {
  it('cria a linha na primeira mudança', async () => {
    mocks.prisma.agendaPreferencia.upsert.mockResolvedValue({ lembretes: false });
    const res = await PATCH(req({ lembretes: false }));
    expect(res.status).toBe(200);
    expect(mocks.prisma.agendaPreferencia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        create: { userId: 'u1', lembretes: false },
        update: { lembretes: false },
      }),
    );
  });

  it('400 com corpo inválido', async () => {
    expect((await PATCH(req({ lembretes: 'sim' }))).status).toBe(400);
    expect(mocks.prisma.agendaPreferencia.upsert).not.toHaveBeenCalled();
  });

  it('consultor agindo pelo cliente não altera (403)', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      ...user,
      actingClient: { id: 'u1', consultantId: 'c1' },
    });
    expect((await PATCH(req({ lembretes: false }))).status).toBe(403);
    expect(mocks.prisma.agendaPreferencia.upsert).not.toHaveBeenCalled();
  });
});
