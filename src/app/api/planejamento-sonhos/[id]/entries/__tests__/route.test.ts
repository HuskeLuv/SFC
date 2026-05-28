import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  planejamentoObjetivo: {
    findFirst: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  planejamentoObjetivoEntry: {
    upsert: vi.fn(),
  },
  // $transaction recebe um array e devolve outro array de resultados.
  $transaction: vi.fn(),
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

import { POST } from '../route';

const baseObjetivo = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'obj-1',
  userId: 'user-1',
  name: 'Casa',
  target: 100_000,
  months: 60,
  startDate: '2026-01',
  available: 0,
  rate: 0.01,
  priority: 'Alta',
  category: 'm',
  status: 'Em espera',
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  entries: [],
  ...overrides,
});

const reqPost = (body: object) =>
  new NextRequest('http://localhost/api/planejamento-sonhos/obj-1/entries', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const callPOST = (body: object, id = 'obj-1') =>
  POST(reqPost(body), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
  // Default: $transaction só roda os ops (em sequência, retornando promises)
  // e devolve o array de resultados. Como nas rotas usamos array literal, os
  // ops já vêm como Promise — só precisamos retornar o array.
  mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('POST /api/planejamento-sonhos/[id]/entries', () => {
  it('cria entry e retorna 201 com objetivo atualizado', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseObjetivo());
    mockPrisma.planejamentoObjetivoEntry.upsert.mockResolvedValue({
      objetivoId: 'obj-1',
      month: '2026-02',
      aporte: 1_000,
      balance: 2_000,
    });
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue(baseObjetivo({ status: 'Iniciado' }));
    mockPrisma.planejamentoObjetivo.findUniqueOrThrow.mockResolvedValue(
      baseObjetivo({
        status: 'Iniciado',
        entries: [{ month: '2026-02', aporte: 1_000, balance: 2_000 }],
      }),
    );

    const res = await callPOST({ month: '2026-02', aporte: 1_000, balance: 2_000 });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.objetivo.entries).toHaveLength(1);
    expect(data.objetivo.entries[0]).toEqual({
      month: '2026-02',
      aporte: 1_000,
      balance: 2_000,
    });
    expect(mockPrisma.planejamentoObjetivoEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { objetivoId_month: { objetivoId: 'obj-1', month: '2026-02' } },
        create: { objetivoId: 'obj-1', month: '2026-02', aporte: 1_000, balance: 2_000 },
        update: { aporte: 1_000, balance: 2_000 },
      }),
    );
  });

  it('aplica upsert por chave única (objetivoId, month)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseObjetivo());
    mockPrisma.planejamentoObjetivoEntry.upsert.mockResolvedValue({});
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue(baseObjetivo());
    mockPrisma.planejamentoObjetivo.findUniqueOrThrow.mockResolvedValue(baseObjetivo());

    await callPOST({ month: '2026-03', aporte: 500, balance: 1_500 });

    expect(mockPrisma.planejamentoObjetivoEntry.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.planejamentoObjetivoEntry.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      objetivoId_month: { objetivoId: 'obj-1', month: '2026-03' },
    });
  });

  it('atualiza status "Em espera" → "Iniciado" no primeiro entry', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(
      baseObjetivo({ status: 'Em espera' }),
    );
    mockPrisma.planejamentoObjetivoEntry.upsert.mockResolvedValue({});
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue(baseObjetivo());
    mockPrisma.planejamentoObjetivo.findUniqueOrThrow.mockResolvedValue(baseObjetivo());

    await callPOST({ month: '2026-02', aporte: 100, balance: 100 });

    const updateCall = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ status: 'Iniciado' });
  });

  it('atualiza status para "Concluído" quando balance >= target', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(
      baseObjetivo({ status: 'Iniciado', target: 10_000 }),
    );
    mockPrisma.planejamentoObjetivoEntry.upsert.mockResolvedValue({});
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue(baseObjetivo());
    mockPrisma.planejamentoObjetivo.findUniqueOrThrow.mockResolvedValue(baseObjetivo());

    await callPOST({ month: '2026-12', aporte: 5_000, balance: 10_000 });

    const updateCall = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ status: 'Concluído' });
  });

  it('não atualiza status quando balance < target e status já é Iniciado', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(
      baseObjetivo({ status: 'Iniciado', target: 100_000 }),
    );
    mockPrisma.planejamentoObjetivoEntry.upsert.mockResolvedValue({});
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue(baseObjetivo());
    mockPrisma.planejamentoObjetivo.findUniqueOrThrow.mockResolvedValue(baseObjetivo());

    await callPOST({ month: '2026-05', aporte: 1_000, balance: 5_000 });

    const updateCall = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    // status === currentStatus → não envia update no campo status
    expect(updateCall.data).toEqual({});
  });

  it('serializa Decimal do target ao calcular autoStatus', async () => {
    // target vem como objeto Decimal-like — deve ser convertido pra number
    // antes da comparação com balance, senão a comparação retorna sempre false.
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(
      baseObjetivo({
        target: { toNumber: () => 5_000 },
        status: 'Iniciado',
      }),
    );
    mockPrisma.planejamentoObjetivoEntry.upsert.mockResolvedValue({});
    mockPrisma.planejamentoObjetivo.update.mockResolvedValue(baseObjetivo());
    mockPrisma.planejamentoObjetivo.findUniqueOrThrow.mockResolvedValue(baseObjetivo());

    await callPOST({ month: '2026-09', aporte: 1_000, balance: 5_000 });

    const updateCall = mockPrisma.planejamentoObjetivo.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ status: 'Concluído' });
  });

  it('valida formato YYYY-MM do month', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseObjetivo());
    const res = await callPOST({ month: '2026-13', aporte: 100, balance: 100 });
    expect(res.status).toBe(400);
  });

  it('valida aporte não pode ser negativo', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseObjetivo());
    const res = await callPOST({ month: '2026-02', aporte: -10, balance: 100 });
    expect(res.status).toBe(400);
  });

  it('retorna 404 quando objetivo é de outro user', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(null);
    const res = await callPOST({ month: '2026-02', aporte: 100, balance: 100 });
    expect(res.status).toBe(404);
    expect(mockPrisma.planejamentoObjetivoEntry.upsert).not.toHaveBeenCalled();
  });
});
