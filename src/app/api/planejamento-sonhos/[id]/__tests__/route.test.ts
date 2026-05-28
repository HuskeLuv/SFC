import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  planejamentoObjetivo: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET, PATCH, DELETE } from '../route';

const baseRow = () => ({
  id: 'obj-1',
  userId: 'user-1',
  name: 'Casa',
  target: 200_000,
  months: 60,
  startDate: '2026-01',
  available: 5_000,
  rate: 0.01,
  priority: 'Alta',
  category: 'm',
  status: 'Em espera',
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  entries: [],
});

const reqGet = () =>
  new NextRequest('http://localhost/api/planejamento-sonhos/obj-1', { method: 'GET' });
const reqPatch = (body: object) =>
  new NextRequest('http://localhost/api/planejamento-sonhos/obj-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const reqDelete = () =>
  new NextRequest('http://localhost/api/planejamento-sonhos/obj-1', { method: 'DELETE' });

const callGET = (id = 'obj-1') => GET(reqGet(), { params: Promise.resolve({ id }) });
const callPATCH = (body: object, id = 'obj-1') =>
  PATCH(reqPatch(body), { params: Promise.resolve({ id }) });
const callDELETE = (id = 'obj-1') => DELETE(reqDelete(), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
});

describe('GET /api/planejamento-sonhos/[id]', () => {
  it('retorna objetivo do user', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseRow());
    const res = await callGET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.objetivo.id).toBe('obj-1');
    expect(mockPrisma.planejamentoObjetivo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'obj-1', userId: 'user-1' },
      }),
    );
  });

  it('retorna 404 quando objetivo é de outro user (não passa no where)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(null);
    const res = await callGET();
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toContain('não encontrado');
  });
});

describe('PATCH /api/planejamento-sonhos/[id]', () => {
  beforeEach(() => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseRow());
    mockPrisma.planejamentoObjetivo.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ ...baseRow(), ...data }),
    );
  });

  it('atualiza apenas campos enviados (preserva o resto)', async () => {
    const res = await callPATCH({ name: 'Novo Nome' });
    expect(res.status).toBe(200);
    const call = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    expect(call.data).toEqual({ name: 'Novo Nome' });
    // Não deve mandar campos não enviados.
    expect(call.data.target).toBeUndefined();
    expect(call.data.months).toBeUndefined();
    expect(call.data.priority).toBeUndefined();
  });

  it('reaplica category quando months muda', async () => {
    await callPATCH({ months: 6 }); // <=12 → 'c'
    const call = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    expect(call.data.category).toBe('c');
    expect(call.data.months).toBe(6);
  });

  it('não recategoriza quando months não muda', async () => {
    await callPATCH({ name: 'Só nome' });
    const call = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    expect(call.data.category).toBeUndefined();
  });

  it('respeita category explícita mesmo quando months muda', async () => {
    await callPATCH({ months: 6, category: 'l' });
    const call = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    expect(call.data.category).toBe('l');
  });

  it('retorna 400 quando body vazio (nenhum campo)', async () => {
    const res = await callPATCH({});
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('Nenhum campo');
  });

  it('retorna 404 quando objetivo não pertence ao user', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(null);
    const res = await callPATCH({ name: 'Hack' });
    expect(res.status).toBe(404);
    expect(mockPrisma.planejamentoObjetivo.update).not.toHaveBeenCalled();
  });

  it('valida months > 480', async () => {
    const res = await callPATCH({ months: 600 });
    expect(res.status).toBe(400);
  });

  it('valida status enum', async () => {
    const res = await callPATCH({ status: 'Invalido' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/planejamento-sonhos/[id]', () => {
  it('remove objetivo (cascade nas entries)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({ id: 'obj-1' });
    mockPrisma.planejamentoObjetivo.delete.mockResolvedValue({});

    const res = await callDELETE();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.planejamentoObjetivo.delete).toHaveBeenCalledWith({
      where: { id: 'obj-1' },
    });
  });

  it('retorna 404 quando objetivo não pertence ao user', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(null);
    const res = await callDELETE();
    expect(res.status).toBe(404);
    expect(mockPrisma.planejamentoObjetivo.delete).not.toHaveBeenCalled();
  });
});
