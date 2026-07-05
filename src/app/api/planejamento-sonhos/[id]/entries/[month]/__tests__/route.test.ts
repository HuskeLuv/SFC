import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  planejamentoObjetivo: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  planejamentoObjetivoEntry: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  userChangeLog: { create: vi.fn() },
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

import { DELETE } from '../route';

const reqDelete = () =>
  new NextRequest('http://localhost/api/planejamento-sonhos/obj-1/entries/2026-02', {
    method: 'DELETE',
  });

const callDELETE = (id = 'obj-1', month = '2026-02') =>
  DELETE(reqDelete(), { params: Promise.resolve({ id, month }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
  mockPrisma.planejamentoObjetivoEntry.findMany.mockResolvedValue([]);
});

describe('DELETE /api/planejamento-sonhos/[id]/entries/[month]', () => {
  it('remove entry com sucesso', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      id: 'obj-1',
      status: 'Iniciado',
      target: 1000,
    });
    mockPrisma.planejamentoObjetivoEntry.deleteMany.mockResolvedValue({ count: 1 });

    const res = await callDELETE();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.planejamentoObjetivoEntry.deleteMany).toHaveBeenCalledWith({
      where: { objetivoId: 'obj-1', month: '2026-02' },
    });
  });

  it('retorna 400 quando month tem formato inválido', async () => {
    const res = await callDELETE('obj-1', '2026-13');
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('YYYY-MM');
    expect(mockPrisma.planejamentoObjetivo.findFirst).not.toHaveBeenCalled();
  });

  it('retorna 404 quando objetivo é de outro user (não vaza existência da entry)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(null);
    const res = await callDELETE();
    expect(res.status).toBe(404);
    expect(mockPrisma.planejamentoObjetivoEntry.deleteMany).not.toHaveBeenCalled();
  });

  it('retorna 404 quando entry não existe (count=0)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      id: 'obj-1',
      status: 'Iniciado',
      target: 1000,
    });
    mockPrisma.planejamentoObjetivoEntry.deleteMany.mockResolvedValue({ count: 0 });
    const res = await callDELETE();
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toContain('Entry');
  });

  describe('re-derivação de status pós-delete (F3.2 residual)', () => {
    it('desfaz "Concluído" → "Em espera" quando última entry é deletada e não sobra nenhuma', async () => {
      mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
        id: 'obj-1',
        status: 'Concluído',
        target: 1000,
      });
      mockPrisma.planejamentoObjetivoEntry.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.planejamentoObjetivoEntry.findMany.mockResolvedValue([]);

      const res = await callDELETE();
      expect(res.status).toBe(200);
      expect(mockPrisma.planejamentoObjetivo.update).toHaveBeenCalledWith({
        where: { id: 'obj-1' },
        data: { status: 'Em espera' },
      });
    });

    it('desfaz "Concluído" → "Iniciado" quando última entry deletada e latest balance < target', async () => {
      mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
        id: 'obj-1',
        status: 'Concluído',
        target: 1000,
      });
      mockPrisma.planejamentoObjetivoEntry.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.planejamentoObjetivoEntry.findMany.mockResolvedValue([
        { month: '2026-01', balance: 500 },
      ]);

      const res = await callDELETE();
      expect(res.status).toBe(200);
      expect(mockPrisma.planejamentoObjetivo.update).toHaveBeenCalledWith({
        where: { id: 'obj-1' },
        data: { status: 'Iniciado' },
      });
    });

    it('preserva "Concluído" quando outra entry remanescente já cobre o target', async () => {
      mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
        id: 'obj-1',
        status: 'Concluído',
        target: 1000,
      });
      mockPrisma.planejamentoObjetivoEntry.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.planejamentoObjetivoEntry.findMany.mockResolvedValue([
        { month: '2026-01', balance: 500 },
        { month: '2026-03', balance: 1200 },
      ]);

      const res = await callDELETE();
      expect(res.status).toBe(200);
      expect(mockPrisma.planejamentoObjetivo.update).not.toHaveBeenCalled();
    });

    it('não toca em status quando atual é "Iniciado" e entries restam', async () => {
      mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
        id: 'obj-1',
        status: 'Iniciado',
        target: 1000,
      });
      mockPrisma.planejamentoObjetivoEntry.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.planejamentoObjetivoEntry.findMany.mockResolvedValue([
        { month: '2026-01', balance: 500 },
      ]);

      const res = await callDELETE();
      expect(res.status).toBe(200);
      expect(mockPrisma.planejamentoObjetivo.update).not.toHaveBeenCalled();
    });
  });
});
