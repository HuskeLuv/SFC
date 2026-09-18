import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  prisma: { agendaPreferencia: { upsert: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { DELETE, POST } from '../route';

const user = {
  payload: { id: 'u1', email: 'a@b.c', role: 'user' },
  targetUserId: 'u1',
  actingClient: null,
};
const req = (method: 'POST' | 'DELETE') =>
  new NextRequest('http://localhost/api/agenda/preferencias/ical', { method });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthWithActing.mockResolvedValue(user);
});

describe('POST /api/agenda/preferencias/ical', () => {
  it('gera um token longo e aleatório e devolve com a data', async () => {
    mocks.prisma.agendaPreferencia.upsert.mockImplementation(
      ({ create }: { create: { icalToken: string } }) => ({
        icalToken: create.icalToken,
        icalCriadoEm: new Date('2026-09-18T12:00:00Z'),
      }),
    );

    const res = await POST(req('POST'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // 32 bytes em base64url = 43 caracteres.
    expect(body.icalToken).toHaveLength(43);
    expect(body.icalToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.icalCriadoEm).toBe('2026-09-18T12:00:00.000Z');
  });

  it('chamar de novo troca o token (o link antigo morre)', async () => {
    const tokens: string[] = [];
    mocks.prisma.agendaPreferencia.upsert.mockImplementation(
      ({ create }: { create: { icalToken: string } }) => {
        tokens.push(create.icalToken);
        return { icalToken: create.icalToken, icalCriadoEm: new Date() };
      },
    );

    await POST(req('POST'));
    await POST(req('POST'));
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it('consultor agindo pelo cliente não gera (403)', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      ...user,
      actingClient: { id: 'u1', consultantId: 'c1' },
    });
    expect((await POST(req('POST'))).status).toBe(403);
    expect(mocks.prisma.agendaPreferencia.upsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/agenda/preferencias/ical', () => {
  it('revoga limpando o token', async () => {
    mocks.prisma.agendaPreferencia.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req('DELETE'));
    expect(res.status).toBe(200);
    expect(mocks.prisma.agendaPreferencia.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { icalToken: null, icalCriadoEm: null },
    });
  });

  it('consultor agindo pelo cliente não revoga (403)', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      ...user,
      actingClient: { id: 'u1', consultantId: 'c1' },
    });
    expect((await DELETE(req('DELETE'))).status).toBe(403);
    expect(mocks.prisma.agendaPreferencia.updateMany).not.toHaveBeenCalled();
  });
});
