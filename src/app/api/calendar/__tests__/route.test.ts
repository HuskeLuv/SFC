import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: { event: { findMany: vi.fn(), create: vi.fn() } },
  requireAuthWithActing: vi.fn(),
  recordChange: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...orig, recordChange: mocks.recordChange };
});

import { GET, POST } from '../route';

const user = {
  payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
  targetUserId: 'user-1',
  actingClient: null,
};
const consultor = {
  payload: { id: 'consultant-1', email: 'c@test.com', role: 'consultant' },
  targetUserId: 'client-1',
  actingClient: { id: 'client-1', name: 'Cliente', email: 'cli@test.com' },
};

const get = (qs = '') => new NextRequest(`http://localhost/api/calendar${qs}`, { method: 'GET' });
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/calendar', {
    method: 'POST',
    body: JSON.stringify(body),
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

describe('GET /api/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthWithActing.mockResolvedValue(user);
  });

  it('devolve a agenda do período com eventos manuais expandidos', async () => {
    mocks.prisma.event.findMany.mockResolvedValue([row]);
    const res = await GET(get('?de=2026-09-01&ate=2026-09-30'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.periodo).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
    expect(body.fontesComErro).toEqual([]);
    expect(body.eventos).toEqual([
      expect.objectContaining({
        id: 'manual:evt-1:2026-09-25',
        tipo: 'manual',
        titulo: 'Renovar seguro',
        data: '2026-09-25',
      }),
    ]);
    expect(mocks.prisma.event.findMany.mock.calls[0][0].where.userId).toBe('user-1');
  });

  it('consultor atuando enxerga a agenda do cliente', async () => {
    mocks.requireAuthWithActing.mockResolvedValue(consultor);
    mocks.prisma.event.findMany.mockResolvedValue([]);
    await GET(get('?de=2026-09-01&ate=2026-09-30'));
    expect(mocks.prisma.event.findMany.mock.calls[0][0].where.userId).toBe('client-1');
  });

  it('período inválido → 400; sem token → 401', async () => {
    expect((await GET(get('?de=2026-09-01&ate=x'))).status).toBe(400);
    mocks.requireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await GET(get())).status).toBe(401);
  });
});

describe('POST /api/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthWithActing.mockResolvedValue(user);
    mocks.prisma.event.create.mockResolvedValue(row);
  });

  it('cria o evento com datas civis e registra no histórico (evento.criar)', async () => {
    const res = await POST(
      post({ titulo: 'Renovar seguro', data: '2026-09-25', categoria: 'pessoal' }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).evento).toMatchObject({
      id: 'evt-1',
      titulo: 'Renovar seguro',
      data: '2026-09-25',
    });
    expect(mocks.prisma.event.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        title: 'Renovar seguro',
        date: new Date('2026-09-25T00:00:00.000Z'),
        description: null,
        endDate: null,
        hora: null,
        categoria: 'pessoal',
        recorrencia: 'nenhuma',
        lembrete: false,
      },
    });
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'calendario',
        action: 'evento.criar',
        entityId: 'evt-1',
        entityLabel: 'Renovar seguro',
        changes: expect.arrayContaining([
          expect.objectContaining({ field: 'titulo', before: null, after: 'Renovar seguro' }),
          expect.objectContaining({ field: 'data', before: null, after: '2026-09-25' }),
        ]),
      }),
    );
  });

  it('valida: fim antes do início, hora inválida, título vazio → 400 sem gravar', async () => {
    expect(
      (await POST(post({ titulo: 'x', data: '2026-09-25', dataFim: '2026-09-24' }))).status,
    ).toBe(400);
    expect((await POST(post({ titulo: 'x', data: '2026-09-25', hora: '25:00' }))).status).toBe(400);
    expect((await POST(post({ titulo: ' ', data: '2026-09-25' }))).status).toBe(400);
    expect(mocks.prisma.event.create).not.toHaveBeenCalled();
  });

  it('consultor não cria (403)', async () => {
    mocks.requireAuthWithActing.mockResolvedValue(consultor);
    expect((await POST(post({ titulo: 'x', data: '2026-09-25' }))).status).toBe(403);
    expect(mocks.prisma.event.create).not.toHaveBeenCalled();
  });
});
